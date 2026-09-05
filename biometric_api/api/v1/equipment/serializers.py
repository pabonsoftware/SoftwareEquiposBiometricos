from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from api.v1.common.file_validation import (
    ATTACHMENT_EXTENSIONS,
    CERTIFICATE_EXTENSIONS,
    DOCUMENT_EXTENSIONS,
    EVIDENCE_EXTENSIONS,
    MAX_IMAGE_BYTES,
    validate_uploaded_file,
)
from apps.branches.models import Branch
from apps.catalog.models import EquipmentModel
from apps.equipment.models import (
Equipment,
EquipmentAttachment,
EquipmentCertificate,
EquipmentInstruction,
EquipmentWorkOrder,
WorkOrderCost,
WorkOrderEvidence,
WorkOrderMeasurement,
WorkOrderSignature,
WorkOrderSparePart
)


class EquipmentSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    equipment_model_name = serializers.CharField(source="equipment_model.name", read_only=True)
    brand_name = serializers.CharField(source="equipment_model.brand.name", read_only=True)
    qr_code_url = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display",read_only=True)
    risk_class_display = serializers.CharField(source="get_risk_class_display",read_only=True)

    class Meta:
        model = Equipment
        fields = (
            # Identificación
            "id",
            "name",
            "asset_tag",
            "internal_code",
            "serial",
            "software_identifier",

            # clasificación
            "equipment_model",
            "equipment_model_name",
            "brand_name",
            "branch",
            "branch_name",
            "location",
            "technology_type",
            "biomedical_classification",
            "risk_class",
            "risk_class_display",

            # Información del equipo
            "manufacturer",
            "owner",
            "client_name",
            "branch_text",
            "department",
            "city",
            "area",

            # Adquisición
            "purchase_date",
            "supplier_acquisition",
            "equipment_cost",
            "manufacture_date",
            "start_use_date",

            # Garantía
            "warranty_start_date",
            "warranty_end_date",

            # Mantenimiento
            "maintenance_provider",
            "maintenance_frequency_months",
            "last_preventive",
            "next_preventive",

            # Calibración
            "calibration_date",
            "calibration_frequency_months",
            "last_calibration",
            "next_calibration",
            "corrective_count",

            # Seguridad eléctrica
            "electrical_safety_class",
            "electrical_safety_type",

            # Regulatorio
            "invima_registration",
            "ecri",

            # Vida útil
            "life_use_years",

            # Observaciones
            "observations",

            # Archivos
            "equipment_image",
            "life_sheet_pdf",

            # Estado
            "status",
            "status_display",

            # Confiabilidad
            "mtbf_hours",
            "mttr_hours",

            # QR
            "qr_code",
            "qr_code_url",

            # Auditoría
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "equipment_model_name",
            "brand_name",
            "qr_code",
            "qr_code_url",
            "mtbf_hours",
            "mttr_hours",
            "created_at",
            "updated_at",
        )
        extra_kwargs = {
            # El mensaje de unicidad lo controla validate_asset_tag (en español).
            "asset_tag": {"validators": []},
            "risk_class": {"required": False, "allow_null": True},
        }

    def get_qr_code_url(self, obj: Equipment) -> str | None:
        if not obj.qr_code:
            return None
        request = self.context.get("request")
        url = obj.qr_code.url
        return request.build_absolute_uri(url) if request else url

    def validate_asset_tag(self, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise serializers.ValidationError(_("El código de inventario no puede estar vacío."))
        qs = Equipment.objects.filter(asset_tag__iexact=normalized)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                _("Ya existe un equipo con este código de inventario.")
            )
        return normalized

    def validate_name(self, value: str) -> str:
        normalized = " ".join(value.split()).strip()
        if not normalized:
            raise serializers.ValidationError(_("El nombre no puede estar vacío."))
        return normalized

    def validate_location(self, value: str) -> str:
        return value.strip()

    def validate_branch(self, value: Branch) -> Branch:
        if not value.is_active:
            raise serializers.ValidationError(_("La sede seleccionada no está activa."))
        return value

    def validate_equipment_model(self, value: EquipmentModel) -> EquipmentModel:
        if not value.is_active:
            raise serializers.ValidationError(_("El modelo seleccionado no está activo."))
        if not value.brand.is_active:
            raise serializers.ValidationError(_("La marca del modelo seleccionado no está activa."))
        return value

    def validate_purchase_date(self, value):
        if value and value > timezone.localdate():
            raise serializers.ValidationError(_("La fecha de compra no puede ser futura."))
        return value

    def validate_life_sheet_pdf(self, value):
        return validate_uploaded_file(value, allowed_extensions=DOCUMENT_EXTENSIONS)

    def validate_equipment_image(self, value):
        # ImageField ya valida (vía Pillow) que el contenido sea una imagen
        # real; acá solo falta el límite de tamaño que sí tienen los demás
        # campos de archivo del sistema.
        if value and value.size > MAX_IMAGE_BYTES:
            raise serializers.ValidationError(
                _("La imagen no puede superar los %(mb)s MB.")
                % {"mb": MAX_IMAGE_BYTES // (1024 * 1024)}
            )
        return value

class EquipmentAttachmentSerializer(serializers.ModelSerializer):

    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:

        model = EquipmentAttachment

        fields = (
            "id",
            "equipment",
            "attachment_type",
            "title",
            "file",
            "uploaded_at",
            "uploaded_by",
            "uploaded_by_name",
        )

        read_only_fields = [
            "id",
            "uploaded_at",
            # Se fuerza server-side en EquipmentAttachmentViewSet.perform_create:
            # si fuera editable, cualquiera podría atribuir el archivo a otro
            # usuario arbitrario.
            "uploaded_by",
            "uploaded_by_name",
        ]

    def get_uploaded_by_name(self,obj):

        if not obj.uploaded_by:

            return None

        return obj.uploaded_by.get_full_name() or obj.uploaded_by.username

    def validate_file(self, value):
        return validate_uploaded_file(value, allowed_extensions=ATTACHMENT_EXTENSIONS)

class EquipmentCertificateSerializer(serializers.ModelSerializer):

    class Meta:

        model = EquipmentCertificate

        fields = "__all__"

        read_only_fields = [
            "id",
            "created_at",
        ]

    def validate_file(self, value):
        return validate_uploaded_file(value, allowed_extensions=CERTIFICATE_EXTENSIONS)


class EquipmentInstructionSerializer(serializers.ModelSerializer):

    class Meta: 

        model = EquipmentInstruction
        fields = '__all__'

        read_only_fields = [
            "id",
        ]


class WorkOrderSparePartSerializer(serializers.ModelSerializer):

    class Meta:
        model = WorkOrderSparePart

        fields = '__all__'

        read_only_fields = [
            "id",
        ]   

class WorkOrderMeasurementSerializer(serializers.ModelSerializer):

    class Meta:

        model = WorkOrderMeasurement

        fields = '__all__'

        read_only_fields = [
            "id",
        ]

class WorkOrderEvidenceSerializer(serializers.ModelSerializer):

    class Meta:

        model = WorkOrderEvidence

        fields = '__all__'

        read_only_fields = [
            "id",
        ]

    def validate_file(self, value):
        return validate_uploaded_file(value, allowed_extensions=EVIDENCE_EXTENSIONS)

class WorkOrderSignatureSerializer(serializers.ModelSerializer):

    class Meta:

        model = WorkOrderSignature

        fields = '__all__'

        read_only_fields = [
            "id",
            "signed_at",
        ]

class WorkOrderCostSerializer(serializers.ModelSerializer):

    class Meta:

        model = WorkOrderCost

        fields = '__all__'

        read_only_fields = [
            "id",
        ]

class EquipmentWorkOrderSerializer(serializers.ModelSerializer):

    technician_name = serializers.SerializerMethodField()

    class Meta:

        model = EquipmentWorkOrder

        fields = (
            "id",
            "equipment",
            "number",
            "service_type",
            "start_date",
            "end_date",
            "description",
            "technician",
            "technician_name",
            "status",
            "report",
            "created_at",
        )

        read_only_fields = [
            "id",
            "created_at",
        ]

    def get_technician_name(self,obj):

        if not obj.technician:
            return None

        return (
            obj.technician.get_full_name()
            or obj.technician.username
        )

    def validate_report(self, value):
        return validate_uploaded_file(value, allowed_extensions=DOCUMENT_EXTENSIONS)