"""Importador masivo de equipos biomédicos desde archivos CSV.

Uso rápido
----------
1. Copia tu archivo ``.csv`` en   ``<BASE_DIR>/imports/equipment/``
2. Ejecuta                        ``python manage.py import_equipment``
3. Revisa el resumen. Cada archivo se mueve a ``processed/`` o ``failed/``
   y, si hubo filas con error, se escribe un ``*.errores.txt`` al lado.

También puedes pasar rutas concretas y opciones::

    python manage.py import_equipment ruta/a/equipos.csv --dry-run
    python manage.py import_equipment --update --partial
    python manage.py import_equipment --no-create-catalog --skip-qr

Formato del CSV
---------------
- Primera fila = encabezados. Se aceptan nombres en inglés (``asset_tag``) o
  español (``placa``); ver ``COLUMNS`` más abajo y el ``README.md`` de la carpeta.
- Separador ``,`` o ``;`` (se detecta solo). Codificación UTF-8 o CP1252.
- Columnas obligatorias: ``name``, ``asset_tag``, ``brand``, ``equipment_model``,
  ``branch``. El resto son opcionales.
- ``branch`` se busca por nombre (o id). La sede debe existir previamente.
- ``brand`` / ``equipment_model`` se crean si no existen (salvo
  ``--no-create-catalog``).
"""

from __future__ import annotations

import csv
import io
import re
import unicodedata
from argparse import BooleanOptionalAction
from collections import Counter
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models.signals import post_save
from django.utils.dateparse import parse_date

from apps.branches.models import Branch
from apps.catalog.models import Brand, EquipmentModel
from apps.equipment.models import Equipment, EquipmentStatus, RiskClass, TechnologyType
from apps.equipment.signals import auto_generate_qr

# --------------------------------------------------------------------------- #
# Especificación de columnas: campo del modelo -> cómo interpretar la celda.
#   kind:  text | upper | int | decimal | date | choice | brand | model | branch
#   aliases: encabezados alternativos aceptados (además del nombre canónico).
# --------------------------------------------------------------------------- #
COLUMNS: dict[str, dict] = {
    "name": {"kind": "text", "required": True, "aliases": ("nombre",)},
    "asset_tag": {
        "kind": "upper",
        "required": True,
        "aliases": (
            "placa",
            "codigo",
            "codigo_inventario",
            "codigo_de_inventario",
            "placa_codigo_de_inventario",
            "placa_inventario",
        ),
    },
    "serial": {"kind": "text", "aliases": ("serie",)},
    "internal_code": {"kind": "text", "aliases": ("codigo_nt", "codigo_n_t", "codigo_interno")},
    "software_identifier": {
        "kind": "text",
        "aliases": ("identificador_software", "id_software", "software_id"),
    },
    "brand": {"kind": "brand", "required": True, "aliases": ("marca",)},
    "equipment_model": {"kind": "model", "required": True, "aliases": ("modelo",)},
    "branch": {"kind": "branch", "required": True, "aliases": ("sede",)},
    "branch_text": {"kind": "text", "aliases": ("marca_texto",)},
    "technology_type": {
        "kind": "choice",
        "choices": TechnologyType,
        "aliases": ("tipo_tecnologia", "tipo_de_tecnologia"),
    },
    "biomedical_classification": {
        "kind": "text",
        "aliases": ("clasificacion_biomedica", "clase", "clasificacion_biomedico"),
    },
    "risk_class": {
        "kind": "choice",
        "choices": RiskClass,
        "strip_prefix": ("clase", "clase de riesgo"),
        "aliases": (
            "clase_riesgo",
            "clasificacion",
            "clasificacion_riesgo",
            "clasificacion_de_riesgo",
            "clasificacion_de_riesgo_invima",
        ),
    },
    "life_use_years": {"kind": "int", "aliases": ("vida_util", "vida_util_anios", "vida_util_años")},
    "manufacture_date": {"kind": "date", "aliases": ("fecha_fabricacion", "fecha_de_fabricacion")},
    "owner": {"kind": "text", "aliases": ("propietario", "titular")},
    "manufacturer": {"kind": "text", "aliases": ("fabricante",)},
    "calibration_date": {
        "kind": "text",
        "aliases": ("codigo_calibracion", "codigo_de_calibracion"),
    },
    "client_name": {"kind": "text", "aliases": ("cliente", "entidad")},
    "department": {"kind": "text", "aliases": ("departamento",)},
    "city": {"kind": "text", "aliases": ("ciudad",)},
    "area": {"kind": "text", "aliases": ("area", "servicio")},
    "location": {"kind": "text", "aliases": ("ubicacion",)},
    "observations": {"kind": "text", "aliases": ("observaciones",)},
    "purchase_date": {"kind": "date", "aliases": ("fecha_compra", "fecha_de_compra")},
    "supplier_acquisition": {
        "kind": "text",
        "aliases": ("proveedor_adquisicion", "proveedor_de_adquisicion"),
    },
    "start_use_date": {
        "kind": "date",
        "aliases": (
            "fecha_inicio_funcionamiento",
            "fecha_inicia_funcionamiento",
        ),
    },
    "equipment_cost": {"kind": "decimal", "aliases": ("costo", "costo_equipo", "precio_compra")},
    "maintenance_provider": {
        "kind": "text",
        "aliases": ("proveedor_mantenimiento", "proveedor_de_mantenimiento"),
    },
    "warranty_start_date": {
        "kind": "date",
        "aliases": (
            "fecha_inicio_garantia",
            "fecha_inicia_garantia",
            "fecha_inicio_garantia_proveedor",
        ),
    },
    "warranty_end_date": {
        "kind": "date",
        "aliases": (
            "fecha_fin_garantia",
            "fecha_finaliza_garantia",
            "fecha_finaliza_garantia_proveedor",
        ),
    },
    "calibration_frequency_months": {
        "kind": "int",
        "aliases": ("frecuencia_calibracion", "frecuencia_calibracion_meses", "frec_calibracion"),
    },
    "maintenance_frequency_months": {
        "kind": "int",
        "aliases": (
            "frecuencia_mantenimiento",
            "frecuencia_mantenimiento_meses",
            "frec_mantenimiento",
        ),
    },
    "ecri": {"kind": "text"},
    "invima_registration": {
        "kind": "text",
        "aliases": ("registro_invima", "registro_sanitario", "registro"),
    },
    "electrical_safety_class": {"kind": "text", "aliases": ("clase_seguridad_electrica",)},
    "electrical_safety_type": {"kind": "text", "aliases": ("tipo_seguridad_electrica",)},
    "status": {
        "kind": "choice",
        "choices": EquipmentStatus,
        "aliases": ("estado",),
        "value_aliases": {
            "ACTIVE": ("activo", "operativo", "en uso", "funcionando"),
            "INACTIVE": ("inactivo", "fuera de servicio", "de baja", "dado de baja"),
            "IN_MAINTENANCE": ("en mantenimiento", "mantenimiento"),
            "IN_REPAIR": ("en reparacion", "reparacion", "en reparación"),
        },
    },
    "last_calibration": {"kind": "text", "aliases": ("ultima_calibracion",)},
    "last_preventive": {"kind": "text", "aliases": ("ultimo_preventivo",)},
    "next_preventive": {"kind": "text", "aliases": ("proximo_preventivo",)},
    "next_calibration": {"kind": "text", "aliases": ("proxima_calibracion",)},
    # Fechas reales que alimentan el semáforo (RF010). Si no vienen, la
    # recurrencia (RF006) las calcula al registrar el primer mantenimiento.
    "next_preventive_date": {
        "kind": "date",
        "aliases": ("fecha_proximo_preventivo", "proximo_preventivo_fecha"),
    },
    "next_calibration_date": {
        "kind": "date",
        "aliases": ("fecha_proxima_calibracion", "proxima_calibracion_fecha"),
    },
    "corrective_count": {"kind": "int", "aliases": ("numero_correctivos", "correctivos")},
    "mtbf_hours": {"kind": "decimal", "aliases": ("mtbf",)},
    "mttr_hours": {"kind": "decimal", "aliases": ("mttr",)},
}

REQUIRED = tuple(c for c, spec in COLUMNS.items() if spec.get("required"))

_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d")


class _RowError(Exception):
    """Una fila del CSV no se pudo importar."""


class _CsvError(Exception):
    """El archivo completo no se pudo leer."""


# --------------------------------------------------------------------------- #
# Normalización de encabezados y mapa alias -> campo canónico
# --------------------------------------------------------------------------- #
def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    text = re.sub(r"[\s\-./]+", "_", text.strip().lower())
    return re.sub(r"_+", "_", text).strip("_")


HEADER_MAP: dict[str, str] = {}
for _canon, _spec in COLUMNS.items():
    HEADER_MAP[_norm(_canon)] = _canon
    for _alias in _spec.get("aliases", ()):
        HEADER_MAP[_norm(_alias)] = _canon


# --------------------------------------------------------------------------- #
# Conversores de celda (levantan ValueError con mensaje en español)
# --------------------------------------------------------------------------- #
def _to_int(raw: str) -> int:
    cleaned = raw.replace(".", "").replace(",", "").replace(" ", "")
    try:
        return int(cleaned)
    except ValueError as exc:
        raise ValueError(f"'{raw}' no es un número entero") from exc


def _to_decimal(raw: str) -> Decimal:
    value = raw.strip().replace(" ", "").replace("$", "")
    if "," in value and "." in value:  # 1.234.567,89 -> 1234567.89
        value = value.replace(".", "").replace(",", ".")
    elif "," in value:  # 1234,89 -> 1234.89
        value = value.replace(",", ".")
    try:
        return Decimal(value)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"'{raw}' no es un número válido") from exc


def _to_date(raw: str):
    value = raw.strip()
    parsed = parse_date(value)
    if parsed:
        return parsed
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"'{raw}' no es una fecha válida (usa AAAA-MM-DD)")


# Valores "basura" que algunas exportaciones usan para decir "sin dato".
SENTINEL_EMPTY = frozenset(
    {
        "no registra",
        "no aplica",
        "no evaluado",
        "no determinado",
        "no definida",
        "no definido",
        "n/a",
        "na",
        "sin dato",
        "sin registro",
        "ninguno",
        "-",
        "--",
    }
)


def _to_choice(raw: str, spec: dict) -> str:
    choices_cls = spec["choices"]
    candidates = [raw.strip().lower()]
    for prefix in spec.get("strip_prefix", ()):
        if candidates[0].startswith(prefix + " "):
            candidates.append(candidates[0][len(prefix) + 1 :].strip())
    for low in candidates:
        for value, label in choices_cls.choices:
            if low in (str(value).lower(), str(label).lower()):
                return value
        for name in choices_cls.names:
            if low == name.lower():
                return getattr(choices_cls, name)
        for value, synonyms in spec.get("value_aliases", {}).items():
            if low in synonyms:
                return value
    opciones = ", ".join(str(value) for value, _ in choices_cls.choices)
    raise ValueError(f"'{raw}' no es válido (opciones: {opciones})")


_ALL_FIELDS = frozenset(f.name for f in Equipment._meta.fields)
_NEVER_VALIDATE = frozenset({"qr_code", "equipment_image", "life_sheet_pdf", "created_at", "updated_at"})


def _validate(obj: Equipment, provided: set[str]) -> None:
    # Solo validamos los campos que trae esta fila: el modelo tiene muchos
    # campos opcionales con ``null=True`` pero sin ``blank=True`` que, si no se
    # excluyen, harían fallar ``full_clean`` por "no puede estar en blanco".
    exclude = sorted((_ALL_FIELDS - provided) | _NEVER_VALIDATE)
    try:
        obj.full_clean(exclude=exclude)
    except DjangoValidationError as exc:
        bits = []
        for field, messages in exc.message_dict.items():
            label = "general" if field == "__all__" else field
            bits.append(f"{label}: {' '.join(str(m) for m in messages)}")
        raise _RowError("; ".join(bits)) from exc


# --------------------------------------------------------------------------- #
# Comando
# --------------------------------------------------------------------------- #
class Command(BaseCommand):
    help = (
        "Importa equipos biomédicos desde CSV. Sin argumentos procesa todos los "
        ".csv de <BASE_DIR>/imports/equipment/."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "paths",
            nargs="*",
            help="Rutas de CSV a importar. Si se omite, se procesa imports/equipment/.",
        )
        parser.add_argument(
            "--dir",
            help="Carpeta a escanear (por defecto <BASE_DIR>/imports/equipment).",
        )
        parser.add_argument(
            "--update",
            action="store_true",
            help="Actualiza los equipos existentes (match por placa). Por defecto se omiten.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Valida y muestra el resultado sin escribir en la base de datos ni mover archivos.",
        )
        parser.add_argument(
            "--partial",
            action="store_true",
            help="Guarda las filas válidas aunque otras fallen. Por defecto un error aborta el archivo.",
        )
        parser.add_argument(
            "--create-catalog",
            action=BooleanOptionalAction,
            default=True,
            help="Crea marcas/modelos inexistentes (por defecto sí).",
        )
        parser.add_argument(
            "--create-branch",
            action="store_true",
            help=(
                "Crea las sedes que no existan con datos de contacto provisionales "
                "(útil para cargas locales; complétalas luego en el panel)."
            ),
        )
        parser.add_argument(
            "--skip-qr",
            action="store_true",
            help="No genera el código QR al crear (más rápido para cargas grandes).",
        )
        parser.add_argument(
            "--no-move",
            action="store_true",
            help="No mueve los archivos a processed/ ni failed/.",
        )
        parser.add_argument("--delimiter", help="Separador de columnas (por defecto se detecta).")
        parser.add_argument("--encoding", help="Codificación del archivo (por defecto se detecta).")
        parser.add_argument(
            "--rows", action="store_true", help="Muestra el detalle fila por fila."
        )

    def handle(self, *args, **options) -> None:
        self.o = options
        drop_dir = (
            Path(options["dir"]).expanduser()
            if options.get("dir")
            else Path(settings.BASE_DIR) / "imports" / "equipment"
        )

        if options["paths"]:
            targets: list[Path] = []
            for raw in options["paths"]:
                path = Path(raw).expanduser()
                if not path.is_file():
                    raise CommandError(f"No existe el archivo: {path}")
                targets.append(path)
        else:
            drop_dir.mkdir(parents=True, exist_ok=True)
            targets = sorted(
                p
                for p in drop_dir.glob("*.csv")
                if p.is_file()
                and p.parent == drop_dir
                and not p.name.startswith(("_", "~$", "plantilla"))
            )

        if not targets:
            self.stdout.write(
                self.style.WARNING(f"No hay archivos .csv para importar en {drop_dir}")
            )
            self.stdout.write("Copia un CSV ahí (o pásalo como argumento) y vuelve a ejecutar.")
            return

        if self.o["dry_run"]:
            self.stdout.write(
                self.style.NOTICE("MODO DRY-RUN: no se escribirá nada en la base de datos.\n")
            )

        disconnected = False
        if self.o["skip_qr"]:
            disconnected = post_save.disconnect(auto_generate_qr, sender=Equipment)

        grand = Counter()
        try:
            for path in targets:
                grand += self._process_file(path, drop_dir)
        finally:
            if disconnected:
                post_save.connect(auto_generate_qr, sender=Equipment)

        self.stdout.write(self.style.MIGRATE_HEADING("\n===== TOTAL ====="))
        self._print_counter(grand)
        if grand["errores"]:
            self.stdout.write(
                self.style.ERROR(
                    f"\n{grand['errores']} fila(s) con error. Revisa el *.errores.txt junto a "
                    f"cada CSV, corrige y vuelve a ejecutar (usa --partial para guardar las válidas)."
                )
            )

    # ---------------------------------------------------------------- file --- #
    def _process_file(self, path: Path, drop_dir: Path) -> Counter:
        self.stdout.write(self.style.MIGRATE_HEADING(f"\n=== {path.name} ==="))
        try:
            rows, present, unknown, collisions = self._read_csv(path)
        except _CsvError as exc:
            self.stderr.write(self.style.ERROR(f"  {exc}"))
            self._finish_file(path, drop_dir, outcome="structural", errors_text=str(exc))
            return Counter(archivos=1, archivos_fallidos=1)

        if unknown:
            self.stdout.write(
                self.style.WARNING(f"  columnas ignoradas: {', '.join(unknown)}")
            )
        for src, canon in collisions:
            self.stdout.write(
                self.style.WARNING(f"  columna {src!r} ignorada: '{canon}' ya viene de otra columna")
            )

        missing = [c for c in REQUIRED if c not in present]
        if missing:
            msg = f"faltan columnas obligatorias: {', '.join(missing)}"
            self.stderr.write(self.style.ERROR(f"  {msg}"))
            self._finish_file(path, drop_dir, outcome="structural", errors_text=msg)
            return Counter(archivos=1, archivos_fallidos=1)

        if not rows:
            self.stdout.write(self.style.WARNING("  el archivo no tiene filas de datos"))
            self._finish_file(path, drop_dir, outcome="ok", errors_text="")
            return Counter(archivos=1)

        stats: Counter = Counter()
        errors: list[tuple[int, str]] = []
        ctx = {"brands": set(), "models": set(), "branches": set()}
        aborted = False

        with transaction.atomic():
            for lineno, row in rows:
                try:
                    with transaction.atomic():
                        result = self._import_row(row, ctx)
                    stats[result] += 1
                    if self.o["rows"]:
                        self.stdout.write(f"  línea {lineno}: {result[:-1]}")
                except _RowError as exc:
                    stats["errores"] += 1
                    errors.append((lineno, str(exc)))
                    if not self.o["partial"]:
                        aborted = True
                        break
            if self.o["dry_run"] or aborted:
                transaction.set_rollback(True)

        saved = not (self.o["dry_run"] or aborted)

        if self.o["dry_run"]:
            state = "DRY-RUN (nada guardado)"
        elif aborted:
            state = "ABORTADO (nada guardado; usa --partial para guardar las válidas)"
        elif errors:
            state = "PARCIAL"
        else:
            state = "OK"
        self.stdout.write(f"  {state}")
        self._print_counter(stats, indent="  ")
        if saved and ctx["branches"]:
            self.stdout.write(
                self.style.WARNING(
                    f"  sedes creadas con contacto provisional (complétalas en el panel): "
                    f"{', '.join(sorted(ctx['branches']))}"
                )
            )
        if saved and ctx["brands"]:
            self.stdout.write(f"  marcas creadas: {', '.join(sorted(ctx['brands']))}")
        if saved and ctx["models"]:
            self.stdout.write(f"  modelos creados: {', '.join(sorted(ctx['models']))}")
        for lineno, msg in errors[:25]:
            self.stdout.write(self.style.ERROR(f"  línea {lineno}: {msg}"))
        if len(errors) > 25:
            self.stdout.write(self.style.ERROR(f"  ... y {len(errors) - 25} error(es) más"))

        errors_text = "\n".join(f"línea {n}: {m}" for n, m in errors)
        outcome = "ok" if (saved and not errors) else "rows"
        self._finish_file(path, drop_dir, outcome=outcome, errors_text=errors_text)

        out = Counter(archivos=1, omitidos=stats["omitidos"], errores=stats["errores"])
        if saved:
            out["creados"] += stats["creados"]
            out["actualizados"] += stats["actualizados"]
        if aborted:
            out["archivos_fallidos"] = 1
        return out

    # ----------------------------------------------------------------- row --- #
    def _import_row(self, row: dict[str, str], ctx: dict) -> str:
        raw_tag = (row.get("asset_tag") or "").strip()
        if not raw_tag:
            raise _RowError("falta la placa (asset_tag)")
        asset_tag = raw_tag.upper()

        existing = Equipment.objects.filter(asset_tag__iexact=asset_tag).first()
        if existing and not self.o["update"]:
            return "omitidos"

        data: dict = {}
        field_errors: list[str] = []
        brand_obj: Brand | None = None
        model_raw: str | None = None

        for canon, raw in row.items():
            value = (raw or "").strip()
            if not value:
                continue
            if canon not in REQUIRED and value.lower() in SENTINEL_EMPTY:
                continue  # "NO REGISTRA", "N/A", ... = celda vacía
            spec = COLUMNS[canon]
            kind = spec["kind"]
            try:
                if kind == "text":
                    data[canon] = value
                elif kind == "upper":
                    data[canon] = value.upper()
                elif kind == "int":
                    data[canon] = _to_int(value)
                elif kind == "decimal":
                    data[canon] = _to_decimal(value)
                elif kind == "date":
                    data[canon] = _to_date(value)
                elif kind == "choice":
                    data[canon] = _to_choice(value, spec)
                elif kind == "brand":
                    brand_obj = self._resolve_brand(value, ctx)
                elif kind == "branch":
                    data["branch"] = self._resolve_branch(value, ctx)
                elif kind == "model":
                    model_raw = value
            except ValueError as exc:
                field_errors.append(f"{canon}: {exc}")

        if model_raw is not None:
            if brand_obj is None:
                field_errors.append(
                    "equipment_model: falta la columna 'brand' (marca) para ubicar el modelo"
                )
            else:
                try:
                    data["equipment_model"] = self._resolve_model(brand_obj, model_raw, ctx)
                except ValueError as exc:
                    field_errors.append(f"equipment_model: {exc}")

        if "name" in data:
            data["name"] = " ".join(data["name"].split())

        if field_errors:
            raise _RowError("; ".join(field_errors))

        provided = set(data)
        if existing:
            for key, val in data.items():
                setattr(existing, key, val)
            _validate(existing, provided)
            existing.save(update_fields=[*provided, "updated_at"])
            return "actualizados"

        obj = Equipment(**data)
        _validate(obj, provided)
        obj.save()
        return "creados"

    def _resolve_brand(self, value: str, ctx: dict) -> Brand:
        name = value.strip()
        brand = Brand.objects.filter(name__iexact=name).first()
        if brand:
            return brand
        if self.o["create_catalog"]:
            brand = Brand.objects.create(name=name)
            ctx["brands"].add(name)
            return brand
        raise ValueError(f"la marca '{name}' no existe (quita --no-create-catalog para crearla)")

    def _resolve_model(self, brand: Brand, value: str, ctx: dict) -> EquipmentModel:
        name = value.strip()
        model = EquipmentModel.objects.filter(brand=brand, name__iexact=name).first()
        if model:
            return model
        if self.o["create_catalog"]:
            model = EquipmentModel.objects.create(brand=brand, name=name)
            ctx["models"].add(f"{brand.name} {name}")
            return model
        raise ValueError(f"el modelo '{name}' no existe para la marca '{brand.name}'")

    def _resolve_branch(self, value: str, ctx: dict) -> Branch:
        raw = value.strip()
        if raw.isdigit():
            branch = Branch.objects.filter(pk=int(raw)).first()
            if branch:
                return branch
            raise ValueError(f"no existe una sede con id {raw}")
        branch = Branch.objects.filter(name__iexact=raw).first()
        if branch:
            return branch
        if self.o["create_branch"]:
            branch = Branch.objects.create(
                name=raw,
                address="Pendiente por definir",
                city="Pendiente",
                phone="0000000",
                email=f"{_norm(raw) or 'sede'}@pendiente.local",
            )
            ctx["branches"].add(raw)
            return branch
        raise ValueError(
            f"la sede '{raw}' no existe; créala en el panel de Sedes o usa --create-branch"
        )

    # ---------------------------------------------------------------- io ---- #
    def _read_csv(
        self, path: Path
    ) -> tuple[list[tuple[int, dict]], set[str], list[str], list[tuple[str, str]]]:
        raw = path.read_bytes()
        encodings = [self.o.get("encoding"), "utf-8-sig", "cp1252", "latin-1"]
        text = None
        for enc in encodings:
            if not enc:
                continue
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        if text is None:
            raise _CsvError("no se pudo decodificar el archivo; guárdalo como UTF-8")

        delimiter = self.o.get("delimiter")
        if not delimiter:
            try:
                delimiter = csv.Sniffer().sniff(text[:8192], delimiters=";,\t|").delimiter
            except csv.Error:
                delimiter = ","

        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        if not reader.fieldnames:
            raise _CsvError("el archivo está vacío o no tiene encabezados")

        header_to_canon: dict[str, str] = {}
        unknown: list[str] = []
        collisions: list[tuple[str, str]] = []
        taken: set[str] = set()
        for header in reader.fieldnames:
            canon = HEADER_MAP.get(_norm(header))
            if not canon:
                if header and header.strip():
                    unknown.append(header)
            elif canon in taken:
                collisions.append((header, canon))  # primera columna gana
            else:
                header_to_canon[header] = canon
                taken.add(canon)

        rows: list[tuple[int, dict]] = []
        for lineno, rowdict in enumerate(reader, start=2):
            mapped = {
                canon: (rowdict.get(header) or "")
                for header, canon in header_to_canon.items()
            }
            if any(str(v).strip() for v in mapped.values()):
                rows.append((lineno, mapped))

        return rows, set(header_to_canon.values()), unknown, collisions

    def _finish_file(self, path: Path, drop_dir: Path, *, outcome: str, errors_text: str) -> None:
        """outcome: 'ok' -> processed/ ; 'structural' -> failed/ ; 'rows' -> se queda
        donde está (así, tras corregir el CSV, basta con volver a ejecutar)."""
        in_drop = path.parent == drop_dir
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        dest = path

        if in_drop and not self.o["dry_run"] and not self.o["no_move"] and outcome != "rows":
            dest_dir = drop_dir / ("processed" if outcome == "ok" else "failed")
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / f"{stamp}_{path.name}"
            try:
                path.replace(dest)
                self.stdout.write(f"  → {dest_dir.name}/{dest.name}")
            except OSError as exc:
                self.stderr.write(self.style.WARNING(f"  no se pudo mover el archivo: {exc}"))
                dest = path

        if errors_text:
            log = dest.with_name(f"{dest.stem}.errores.txt")
            try:
                log.write_text(errors_text + "\n", encoding="utf-8")
                self.stdout.write(self.style.ERROR(f"  errores → {log}"))
            except OSError:
                pass

    def _print_counter(self, counter: Counter, indent: str = "  ") -> None:
        self.stdout.write(
            f"{indent}creados={counter['creados']}  actualizados={counter['actualizados']}  "
            f"omitidos={counter['omitidos']}  errores={counter['errores']}"
        )
