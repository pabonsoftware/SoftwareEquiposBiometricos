from io import StringIO

import pytest
from django.core.management import call_command

from apps.branches.tests.factories import BranchFactory
from apps.catalog.models import Brand, EquipmentModel
from apps.catalog.tests.factories import EquipmentModelFactory
from apps.equipment.models import Equipment

HEADER = "name,asset_tag,brand,equipment_model,branch\n"


def run(*args: str) -> str:
    out = StringIO()
    call_command("import_equipment", *args, "--skip-qr", stdout=out, stderr=out)
    return out.getvalue()


@pytest.mark.django_db
class TestImportEquipmentCommand:
    def test_creates_equipment_and_catalog(self, tmp_path):
        BranchFactory(name="Sede Principal")
        csv = tmp_path / "equipos.csv"
        csv.write_text(HEADER + "Monitor,EQ-1001,Mindray,uMEC10,Sede Principal\n", encoding="utf-8")

        run(str(csv))

        eq = Equipment.objects.get(asset_tag="EQ-1001")
        assert eq.name == "Monitor"
        assert eq.equipment_model.name == "uMEC10"
        assert eq.equipment_model.brand.name == "Mindray"
        assert Brand.objects.filter(name="Mindray").count() == 1

    def test_asset_tag_is_uppercased_and_matched_case_insensitively(self, tmp_path):
        BranchFactory(name="Sede Principal")
        csv = tmp_path / "e.csv"
        csv.write_text(HEADER + "Monitor,eq-1001,Mindray,uMEC10,Sede Principal\n", encoding="utf-8")
        run(str(csv))
        assert Equipment.objects.filter(asset_tag="EQ-1001").exists()

    def test_dry_run_writes_nothing(self, tmp_path):
        BranchFactory(name="Sede Principal")
        csv = tmp_path / "e.csv"
        csv.write_text(HEADER + "Monitor,EQ-1001,Mindray,uMEC10,Sede Principal\n", encoding="utf-8")

        run(str(csv), "--dry-run")

        assert not Equipment.objects.exists()
        assert not Brand.objects.exists()

    def test_unknown_branch_aborts_whole_file(self, tmp_path):
        BranchFactory(name="Sede Principal")
        csv = tmp_path / "e.csv"
        csv.write_text(
            HEADER
            + "Monitor,EQ-1001,Mindray,uMEC10,Sede Principal\n"
            + "Bomba,EQ-1002,BBraun,Infusomat,Sede Fantasma\n",
            encoding="utf-8",
        )

        output = run(str(csv))

        assert not Equipment.objects.exists()  # la fila buena también se revierte
        assert "Sede Fantasma" in output
        assert (tmp_path / "e.errores.txt").exists()

    def test_partial_keeps_valid_rows(self, tmp_path):
        BranchFactory(name="Sede Principal")
        csv = tmp_path / "e.csv"
        csv.write_text(
            HEADER
            + "Monitor,EQ-1001,Mindray,uMEC10,Sede Principal\n"
            + "Bomba,EQ-1002,BBraun,Infusomat,Sede Fantasma\n",
            encoding="utf-8",
        )

        run(str(csv), "--partial")

        assert Equipment.objects.filter(asset_tag="EQ-1001").exists()
        assert not Equipment.objects.filter(asset_tag="EQ-1002").exists()

    def test_existing_equipment_skipped_without_update(self, tmp_path):
        branch = BranchFactory(name="Sede Principal")
        model = EquipmentModelFactory()
        Equipment.objects.create(
            name="Viejo", asset_tag="EQ-1001", branch=branch, equipment_model=model
        )
        csv = tmp_path / "e.csv"
        csv.write_text(
            HEADER + f"Nuevo Nombre,EQ-1001,{model.brand.name},{model.name},Sede Principal\n",
            encoding="utf-8",
        )

        run(str(csv))
        assert Equipment.objects.get(asset_tag="EQ-1001").name == "Viejo"

        run(str(csv), "--update")
        assert Equipment.objects.get(asset_tag="EQ-1001").name == "Nuevo Nombre"

    def test_spanish_headers_and_semicolon_delimiter(self, tmp_path):
        BranchFactory(name="Sede Principal")
        csv = tmp_path / "e.csv"
        csv.write_text(
            "nombre;placa;marca;modelo;sede\n"
            "Desfibrilador;EQ-2002;Zoll;R Series;Sede Principal\n",
            encoding="utf-8",
        )

        run(str(csv))

        assert Equipment.objects.filter(asset_tag="EQ-2002").exists()

    def test_no_create_catalog_fails_missing_model(self, tmp_path):
        BranchFactory(name="Sede Principal")
        csv = tmp_path / "e.csv"
        csv.write_text(HEADER + "Monitor,EQ-1001,Mindray,uMEC10,Sede Principal\n", encoding="utf-8")

        output = run(str(csv), "--no-create-catalog")

        assert not Equipment.objects.exists()
        assert "no existe" in output.lower()
        assert not EquipmentModel.objects.exists()

    def test_typed_fields_and_choices_are_coerced(self, tmp_path):
        BranchFactory(name="Sede Principal")
        csv = tmp_path / "e.csv"
        csv.write_text(
            "name,asset_tag,brand,equipment_model,branch,risk_class,purchase_date,equipment_cost,"
            "maintenance_frequency_months,estado\n"
            "Monitor,EQ-1001,Mindray,uMEC10,Sede Principal,IIb,2023-05-12,\"4.500.000,50\",6,Operativo\n",
            encoding="utf-8",
        )

        run(str(csv))

        eq = Equipment.objects.get(asset_tag="EQ-1001")
        assert eq.risk_class == "IIB"
        assert str(eq.purchase_date) == "2023-05-12"
        assert str(eq.equipment_cost) == "4500000.50"
        assert eq.maintenance_frequency_months == 6
        assert eq.status == "ACTIVE"

    def test_scan_directory_moves_processed_file_and_skips_template(self, tmp_path):
        BranchFactory(name="Sede Principal")
        drop = tmp_path / "imports" / "equipment"
        drop.mkdir(parents=True)
        (drop / "lote1.csv").write_text(
            HEADER + "Monitor,EQ-1001,Mindray,uMEC10,Sede Principal\n", encoding="utf-8"
        )
        (drop / "plantilla_equipos.csv").write_text(
            HEADER + "NoImportar,EQ-9999,X,Y,Sede Inexistente\n", encoding="utf-8"
        )

        run("--dir", str(drop))

        assert Equipment.objects.filter(asset_tag="EQ-1001").exists()
        assert not Equipment.objects.filter(asset_tag="EQ-9999").exists()
        assert (drop / "plantilla_equipos.csv").exists()  # no se toca
        assert not (drop / "lote1.csv").exists()
        assert list((drop / "processed").glob("*_lote1.csv"))

    def test_row_errors_leave_file_in_place_for_retry(self, tmp_path):
        BranchFactory(name="Sede Principal")
        drop = tmp_path / "imports" / "equipment"
        drop.mkdir(parents=True)
        csv = drop / "lote.csv"
        csv.write_text(HEADER + "Monitor,EQ-1,Mindray,uMEC10,Sede Fantasma\n", encoding="utf-8")

        run("--dir", str(drop))

        assert csv.exists()  # sigue ahí: se corrige y se vuelve a correr
        assert (drop / "lote.errores.txt").exists()
        assert not (drop / "failed").exists()
