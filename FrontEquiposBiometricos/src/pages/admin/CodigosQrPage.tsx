import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/context/AuthContext";
import { equipmentService } from "@/services/equipment.service";
import { branchesService } from "@/services/branches.service";
import { can } from "@/lib/permissions";
import { getApiErrorMessage } from "@/lib/api";
import type { Branch } from "@/types/branch";
import type { EquipmentQr } from "@/types/equipment";

/** Opciones del selector "columnas por fila" de la hoja de impresión. */
const COLUMN_OPTIONS = [
  { value: "2", label: "2 por fila (grandes)" },
  { value: "3", label: "3 por fila" },
  { value: "4", label: "4 por fila (pequeñas)" },
];

// Cuántos QR por página lo decide el backend (api/v1/common/pagination.py →
// QrCodePagination). Este es solo el valor por defecto mientras llega la
// primera respuesta; luego se usa el `page_size` que manda el servidor.
const DEFAULT_PAGE_SIZE = 20;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/**
 * Documento HTML autónomo con una hoja de etiquetas QR para imprimir. Se abre
 * en una ventana nueva; al terminar de cargar las imágenes dispara `print()`.
 */
function buildPrintHtml(items: EquipmentQr[], columns: number): string {
  const qrSize = columns >= 4 ? 70 : columns === 3 ? 90 : 120;
  const nameSize = columns >= 4 ? 10 : 12;
  const subSize = columns >= 4 ? 8 : 9;

  const labels = items
    .map((eq) => {
      const modelo = [eq.brand_name, eq.equipment_model_name]
        .filter(Boolean)
        .join(" ");
      const qr = eq.qr_code_url
        ? `<img src="${escapeHtml(eq.qr_code_url)}" alt="QR ${escapeHtml(eq.asset_tag)}" />`
        : `<div class="noqr">Sin QR</div>`;
      return `
        <div class="label">
          <div class="qr">${qr}</div>
          <div class="meta">
            <p class="tag">${escapeHtml(eq.asset_tag)}</p>
            <p class="name">${escapeHtml(eq.name)}</p>
            ${modelo ? `<p class="sub">${escapeHtml(modelo)}</p>` : ""}
            ${eq.branch_name ? `<p class="sub">${escapeHtml(eq.branch_name)}</p>` : ""}
          </div>
        </div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Etiquetas QR de equipos</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .sheet {
      display: grid;
      grid-template-columns: repeat(${columns}, 1fr);
      gap: 8px;
      padding: 10mm;
    }
    .label {
      display: flex;
      align-items: center;
      gap: 10px;
      border: 1px solid #111;
      padding: 8px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .qr { flex: 0 0 auto; }
    .qr img { display: block; width: ${qrSize}px; height: auto; }
    .noqr {
      width: ${qrSize}px; height: ${qrSize}px;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; color: #999; border: 1px dashed #ccc;
    }
    .meta { min-width: 0; }
    .tag { margin: 0; font-family: ui-monospace, Menlo, monospace; font-size: ${nameSize}px; font-weight: 700; }
    .name { margin: 2px 0 0; font-size: ${nameSize}px; line-height: 1.2; }
    .sub { margin: 1px 0 0; font-size: ${subSize}px; color: #444; line-height: 1.2; }
    @page { margin: 8mm; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="sheet">${labels}</div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.focus(); window.print(); }, 300);
    });
  </script>
</body>
</html>`;
}

/** Abre la hoja de etiquetas en una ventana nueva y lanza el diálogo de impresión. */
function printLabels(items: EquipmentQr[], columns: number): void {
  // Sin `noopener`: se necesita la referencia a la ventana para escribir el HTML.
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("El navegador bloqueó la ventana de impresión. Habilita las ventanas emergentes e inténtalo de nuevo.");
    return;
  }
  win.document.open();
  win.document.write(buildPrintHtml(items, columns));
  win.document.close();
}

async function downloadQr(eq: EquipmentQr) {
  if (!eq.qr_code_url) return;
  try {
    const res = await fetch(eq.qr_code_url);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${eq.asset_tag}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    window.open(eq.qr_code_url, "_blank", "noopener,noreferrer");
  }
}

export function CodigosQrPage() {
  const { usuario } = useAuth();
  const canRegenerate = can(usuario?.role, "equipment", "edit");

  const [items, setItems] = useState<EquipmentQr[]>([]);
  const [count, setCount] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);
  // Columnas de la hoja de impresión de etiquetas (COLUMN_OPTIONS).
  const [printColumns, setPrintColumns] = useState("3");

  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const start = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min((page - 1) * pageSize + items.length, count);

  const branchOptions = useMemo(
    () => branches.map((b) => ({ value: String(b.id), label: b.name })),
    [branches],
  );

  useEffect(() => {
    branchesService
      .list({ ordering: "name" })
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);

  // Cambiar un filtro vuelve a la página 1 (se hace en el handler, no en un
  // effect, para no encadenar renders).
  const onSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const onBranchFilter = (value: string) => {
    setBranchFilter(value);
    setPage(1);
  };

  useEffect(() => {
    const id = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      equipmentService
        .qrCodes({
          search: search || undefined,
          branch: branchFilter ? Number(branchFilter) : undefined,
          page,
        })
        .then((data) => {
          setItems(data.results);
          setCount(data.count);
          if (data.page_size) setPageSize(data.page_size);
        })
        .catch((err) =>
          setError(getApiErrorMessage(err, "No se pudieron cargar los códigos QR")),
        )
        .finally(() => setLoading(false));
    }, 300);
    return () => window.clearTimeout(id);
  }, [search, branchFilter, page]);

  const regenerate = async (eq: EquipmentQr) => {
    setRegeneratingId(eq.id);
    try {
      const updated = await equipmentService.regenerateQr(eq.id);
      setItems((prev) =>
        prev.map((it) =>
          it.id === eq.id
            ? { ...it, qr_code_url: cacheBust(updated.qr_code_url) }
            : it,
        ),
      );
    } catch (err) {
      alert(getApiErrorMessage(err, "No se pudo regenerar el QR"));
    } finally {
      setRegeneratingId(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-app sm:text-3xl">Etiquetas QR</h1>
          <p className="text-sm text-app-muted">
            Un QR por equipo, generado automáticamente al registrarlo. Apunta a
            la hoja de vida del equipo.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-44">
            <Select
              label="Columnas al imprimir"
              value={printColumns}
              onChange={(e) => setPrintColumns(e.target.value)}
              options={COLUMN_OPTIONS}
            />
          </div>
          <Button
            variant="secondary"
            leftIcon={<Printer size={16} />}
            onClick={() => printLabels(items, Number(printColumns))}
            disabled={items.length === 0}
          >
            Imprimir etiquetas
          </Button>
        </div>
      </div>

      <Card>
        <div className="grid gap-2 sm:grid-cols-4">
          <Input
            placeholder="Buscar por nombre, placa o modelo..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
          <Select
            placeholder="Todas las sedes"
            value={branchFilter}
            onChange={(e) => onBranchFilter(e.target.value)}
            options={branchOptions}
          />
        </div>
      </Card>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-app-muted">Cargando...</p>
      ) : items.length === 0 ? (
        <Card>
          <p className="py-10 text-center text-sm text-app-muted">
            No se encontraron equipos con los filtros actuales.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((eq) => (
            <div
              key={eq.id}
              className="flex flex-col items-center gap-2 rounded-xl border border-app bg-surface p-3 text-center shadow-sm"
            >
              <div className="rounded-lg border border-app bg-white p-2">
                {eq.qr_code_url ? (
                  <img
                    src={eq.qr_code_url}
                    alt={`QR del equipo ${eq.asset_tag}`}
                    className="h-32 w-32 object-contain"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center text-xs text-app-muted">
                    Sin QR
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold text-app">
                  {eq.asset_tag}
                </p>
                <p className="truncate text-xs text-app" title={eq.name}>
                  {eq.name}
                </p>
                <p className="truncate text-[11px] text-app-muted">
                  {(eq.brand_name ?? "—") +
                    " · " +
                    (eq.equipment_model_name ?? "—")}
                </p>
              </div>
              <div className="mt-auto flex flex-wrap justify-center gap-1 print:hidden">
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Download size={13} />}
                  disabled={!eq.qr_code_url}
                  onClick={() => void downloadQr(eq)}
                >
                  QR
                </Button>
                {canRegenerate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<RefreshCw size={13} />}
                    loading={regeneratingId === eq.id}
                    onClick={() => void regenerate(eq)}
                    title="Regenerar el QR"
                  >
                    Regenerar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-app-muted print:hidden">
        <p>
          {count === 0
            ? "Sin resultados"
            : `Mostrando ${start}–${end} de ${count}`}
        </p>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<ChevronLeft size={14} />}
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span className="px-2 text-app">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            rightIcon={<ChevronRight size={14} />}
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Añade `?v=<timestamp>` para forzar al navegador a recargar el PNG tras regenerarlo. */
function cacheBust(url: string | null | undefined): string | null {
  if (!url) return null;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${Date.now()}`;
}
