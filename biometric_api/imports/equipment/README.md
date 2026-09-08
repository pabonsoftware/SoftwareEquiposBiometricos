# Carga masiva de equipos

Deja aquí un archivo `.csv` con los equipos y ejecuta desde `biometric_api/`:

```bash
python manage.py import_equipment
```

Se procesan **todos** los `.csv` de esta carpeta (se ignoran `plantilla_equipos.csv`,
los que empiezan por `_` y los temporales de Excel `~$`).

- Si todo salió bien, el archivo se mueve a `processed/`.
- Si hubo filas con error, **se queda donde está** y se escribe un `*.errores.txt`
  al lado: corrige el CSV y vuelve a ejecutar.
- Si el archivo no se puede leer (encoding, faltan columnas obligatorias), se mueve
  a `failed/`.

## Opciones útiles

| Comando | Qué hace |
|---|---|
| `python manage.py import_equipment` | Procesa todos los `.csv` de esta carpeta. |
| `python manage.py import_equipment ruta/archivo.csv` | Procesa un archivo concreto (no lo mueve). |
| `--dry-run` | Valida y muestra el resultado **sin escribir** nada. |
| `--update` | Actualiza los equipos que ya existan (match por placa). Por defecto se omiten. |
| `--partial` | Guarda las filas válidas aunque otras fallen. Por defecto un error aborta todo el archivo. |
| `--create-branch` | Crea las sedes que no existan con contacto provisional (útil en local; complétalas luego en el panel). |
| `--no-create-catalog` | No crea marcas/modelos nuevos; si no existen, la fila falla. |
| `--skip-qr` | No genera el QR al crear (más rápido para cargas grandes). |
| `--rows` | Muestra el detalle fila por fila. |

## Formato del CSV

- **Primera fila = encabezados.** El separador puede ser `,` o `;` (se detecta
  solo). Codificación UTF-8 o CP1252 (el "CSV" de Excel en español funciona).
- **Columnas obligatorias:** `name`, `asset_tag`, `brand`, `equipment_model`, `branch`.
- La **sede** (`branch`) se busca por nombre exacto (o por id). Debe existir antes,
  salvo que pases `--create-branch` (la crea con contacto provisional).
- La **marca** (`brand`) y el **modelo** (`equipment_model`) se crean si no existen,
  salvo que pases `--no-create-catalog`.
- Celdas vacías = campo sin valor. Fechas en `AAAA-MM-DD` (también se aceptan
  `DD/MM/AAAA`). Decimales con `.` o `,`.

### Columnas aceptadas

Se acepta el nombre en inglés o el alias en español (mayúsculas/tildes/espacios
son indiferentes).

| Campo | Alias en español | Tipo |
|---|---|---|
| `name` | nombre | texto **(obligatorio)** |
| `asset_tag` | placa, código de inventario | texto **(obligatorio)** |
| `brand` | marca | texto **(obligatorio)** |
| `equipment_model` | modelo | texto **(obligatorio)** |
| `branch` | sede | nombre o id **(obligatorio)** |
| `serial` | serie | texto |
| `internal_code` | código NT, código interno | texto |
| `software_identifier` | identificador software | texto |
| `branch_text` | marca (texto) | texto |
| `technology_type` | tipo tecnología | `ELECTRONIC` / `ELECTROMEDICAL` / `MECHANICAL` / `MIXED` / `OTHER` (o su etiqueta) |
| `biomedical_classification` | clasificación biomédica | texto |
| `risk_class` | riesgo, clase riesgo | `I` / `IIA` / `IIB` / `III` |
| `life_use_years` | vida útil | entero |
| `manufacture_date` | fecha fabricación | fecha |
| `owner` | propietario | texto |
| `manufacturer` | fabricante | texto |
| `calibration_date` | código calibración | texto |
| `client_name` | cliente | texto |
| `department` | departamento | texto |
| `city` | ciudad | texto |
| `area` | área | texto |
| `location` | ubicación | texto |
| `observations` | observaciones | texto |
| `purchase_date` | fecha compra | fecha (no futura) |
| `supplier_acquisition` | proveedor adquisición | texto |
| `start_use_date` | fecha inicio funcionamiento | fecha |
| `equipment_cost` | costo, costo equipo | decimal |
| `maintenance_provider` | proveedor mantenimiento | texto |
| `warranty_start_date` | fecha inicio garantía | fecha |
| `warranty_end_date` | fecha fin garantía | fecha |
| `calibration_frequency_months` | frecuencia calibración | entero |
| `maintenance_frequency_months` | frecuencia mantenimiento | entero |
| `ecri` | — | texto |
| `invima_registration` | registro invima | texto |
| `electrical_safety_class` | clase seguridad eléctrica | texto |
| `electrical_safety_type` | tipo seguridad eléctrica | texto |
| `status` | estado | `ACTIVE` / `INACTIVE` / `IN_MAINTENANCE` / `IN_REPAIR` (por defecto `ACTIVE`) |
| `last_calibration` | última calibración | texto |
| `last_preventive` | último preventivo | texto |
| `next_preventive` | próximo preventivo | texto |
| `next_calibration` | próxima calibración | texto |
| `corrective_count` | número correctivos | entero |
| `mtbf_hours` | mtbf | decimal |
| `mttr_hours` | mttr | decimal |

Ver [`plantilla_equipos.csv`](plantilla_equipos.csv) como punto de partida.
