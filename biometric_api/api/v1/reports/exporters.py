"""Exportación de reportes a CSV (RF012 / RFN010 — "exportación o descarga").

CSV con `csv` de la stdlib: cero dependencias, lo abre Excel y cualquier hoja
de cálculo. Se antepone el BOM UTF-8 para que Excel respete los acentos.
"""
from __future__ import annotations

import csv
import io
from collections.abc import Iterable, Sequence
from datetime import date

from django.http import HttpResponse


def csv_response(
    filename_stem: str,
    header: Sequence[str],
    rows: Iterable[Sequence[object]],
) -> HttpResponse:
    buffer = io.StringIO()
    buffer.write("﻿")  # BOM para Excel
    writer = csv.writer(buffer, delimiter=";")  # ; → locales es-CO en Excel
    writer.writerow(header)
    for row in rows:
        writer.writerow(["" if value is None else value for value in row])

    stamp = date.today().isoformat()
    response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = (
        f'attachment; filename="{filename_stem}_{stamp}.csv"'
    )
    return response
