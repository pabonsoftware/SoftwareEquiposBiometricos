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
from api.v1.helpers.semaforizacion import semaphore_payload
from apps.branches.models import Branch
from apps.catalog.models import EquipmentModel
from apps.equipment.models import (
Equipment,
EquipmentAttachment,
EquipmentCertificate,
EquipmentInstruction,
EquipmentWorkOrder,
WorkOrderActivity,
WorkOrderCost,
WorkOrderEvidence,
WorkOrderMeasurement,
WorkOrderSignature,
WorkOrderSparePart
)
from apps.equipment.services import generate_work_order_number


class EquipmentSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    equipment_model_name = serializers.CharField(source="equipment_model.name", read_only=True)
    brand_name = serializers.CharField(source="equipment_model.brand.name", read_only=True)
    qr_code_url = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display",read_only=True)
    risk_class_display = serializers.CharField(source="get_risk_class_display",read_only=True)
    # Semáforos RF010 — se calculan en el modelo (única fuente de verdad) y aquí
    # solo se exponen como {code, label, days_left}.
    preventive_status = serializers.SerializerMethodField()
    calibration_status = serializers.SerializerMethodField()
    maintenance_semaphore = serializers.SerializerMethodField()

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
            "next_preventive_date",
            "next_calibration_date",
            "preventive_status",
            "calibration_status",
            "maintenance_semaphore",
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

    def get_preventive_status(self, obj: Equipment) -> dict:
        return semaphore_payload(
            obj.next_preventive_date,
            timezone.localdate(),
            Equipment.PREVENTIVE_WARNING_DAYS,
        )

    def get_calibration_status(self, obj: Equipment) -> dict:
        return semaphore_payload(
            obj.next_calibration_date,
            timezone.localdate(),
            Equipment.CALIBRATION_WARNING_DAYS,
        )

    def get_maintenance_semaphore(self, obj: Equipment) -> dict:
        # El código lo decide el modelo (worst-of); acá solo se le pone label.
        status = obj.maintenance_semaphore
        return {"code": status.value, "label": str(status.label)}

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


class EquipmentQrSerializer(serializers.ModelSerializer):
    """Vista liviana para la galería de códigos QR: solo lo que se pinta en la
    tarjeta (identificación + URL del PNG)."""

    brand_name = serializers.CharField(source="equipment_model.brand.name", read_only=True)
    equipment_model_name = serializers.CharField(source="equipment_model.name", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    qr_code_url = serializers.SerializerMethodField()

    class Meta:
        model = Equipment
        fields = (
            "id",
            "asset_tag",
            "name",
            "brand_name",
            "equipment_model_name",
            "branch_name",
            "qr_code_url",
        )

    def get_qr_code_url(self, obj: Equipment) -> str | None:
        if not obj.qr_code:
            return None
        request = self.context.get("request")
        url = obj.qr_code.url
        return request.build_absolute_uri(url) if request else url


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

class WorkOrderActivitySerializer(serializers.ModelSerializer):
    """Actividad técnica registrada durante la ejecución de la orden (RF009)."""

    performed_by_name = serializers.SerializerMethodField()
    equipment_status_after_display = serializers.CharField(
        source="get_equipment_status_after_display", read_only=True
    )

    class Meta:
        model = WorkOrderActivity
        fields = (
            "id",
            "work_order",
            "performed_at",
            "performed_by",
            "performed_by_name",
            "description",
            "findings",
            "recommendations",
            "hourmeter",
            "equipment_status_after",
            "equipment_status_after_display",
            "created_at",
        )
        read_only_fields = ("id", "performed_by_name", "equipment_status_after_display", "created_at")

    def get_performed_by_name(self, obj):
        if not obj.performed_by:
            return None
        return obj.performed_by.get_full_name() or obj.performed_by.username

    def validate_description(self, value: str) -> str:
        normalized = (value or "").strip()
        if not normalized:
            raise serializers.ValidationError(_("La actividad realizada es obligatoria."))
        return normalized

    def validate_hourmeter(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError(_("El horómetro no puede ser negativo."))
        return value


class EquipmentWorkOrderSerializer(serializers.ModelSerializer):

    technician_name = serializers.SerializerMethodField()
    equipment_name = serializers.CharField(source="equipment.name", read_only=True)
    equipment_asset_tag = serializers.CharField(
        source="equipment.asset_tag", read_only=True
    )
    service_type_display = serializers.CharField(
        source="get_service_type_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    schedule_info = serializers.SerializerMethodField()
    # `number` se autogenera si no se envía (OT-<fecha>-<placa>).
    number = serializers.CharField(required=False, allow_blank=True, max_length=50)
    approved_by_name = serializers.SerializerMethodField()
    closed_by_name = serializers.SerializerMethodField()
    activities_count = serializers.IntegerField(source="activities.count", read_only=True)
    # Semáforo de cumplimiento de la orden (RF010 §10) — mismo helper que el resto.
    semaphore = serializers.SerializerMethodField()

    class Meta:

        model = EquipmentWorkOrder

        fields = (
            "id",
            "equipment",
            "equipment_name",
            "equipment_asset_tag",
            "number",
            "service_type",
            "service_type_display",
            "start_date",
            "end_date",
            "description",
            "technician",
            "technician_name",
            "status",
            "status_display",
            "semaphore",
            "report",
            "schedule_info",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "closed_by",
            "closed_by_name",
            "closed_at",
            "closing_notes",
            "cancelled_by",
            "cancelled_at",
            "cancel_reason",
            "activities_count",
            "created_at",
        )

        read_only_fields = [
            "id",
            "equipment_name",
            "equipment_asset_tag",
            "service_type_display",
            "status_display",
            "technician_name",
            "schedule_info",
            "semaphore",
            # La máquina de estados es la única vía de cambio (RF008/§9): estos
            # campos no se editan por PATCH, solo por las acciones del ViewSet.
            "status",
            "approved_by",
            "approved_by_name",
            "approved_at",
            "closed_by",
            "closed_by_name",
            "closed_at",
            "closing_notes",
            "cancelled_by",
            "cancelled_at",
            "cancel_reason",
            "activities_count",
            "created_at",
        ]

    def get_technician_name(self,obj):

        if not obj.technician:
            return None

        return (
            obj.technician.get_full_name()
            or obj.technician.username
        )

    def get_approved_by_name(self, obj):
        if not obj.approved_by:
            return None
        return obj.approved_by.get_full_name() or obj.approved_by.username

    def get_closed_by_name(self, obj):
        if not obj.closed_by:
            return None
        return obj.closed_by.get_full_name() or obj.closed_by.username

    def validate_number(self, value: str) -> str:
        return (value or "").strip()

    def create(self, validated_data):
        if not validated_data.get("number"):
            validated_data["number"] = generate_work_order_number(validated_data["equipment"])
        return super().create(validated_data)

    def get_schedule_info(self, obj):
        """Si la orden salió de una solicitud programada, devuelve un resumen
        del agendamiento (vía la hoja de vida). `None` para órdenes creadas
        directamente."""
        record = getattr(obj, "maintenance_record", None)
        schedule = getattr(record, "scheduled_maintenance", None) if record else None
        if schedule is None:
            return None
        return {
            "id": schedule.id,
            "kind": schedule.kind,
            "scheduled_date": schedule.scheduled_date,
            "is_completed": schedule.is_completed,
        }

    def get_semaphore(self, obj) -> dict:
        status = obj.schedule_semaphore
        return {
            "code": status.value,
            "label": str(status.label),
        }

    def validate_report(self, value):
        return validate_uploaded_file(value, allowed_extensions=DOCUMENT_EXTENSIONS)


class EquipmentWorkOrderDetailSerializer(EquipmentWorkOrderSerializer):
    """Orden de trabajo con todos sus elementos anidados (solo lectura): se usa
    en la acción `work-orders/{id}/details/`."""

    spare_parts = WorkOrderSparePartSerializer(many=True, read_only=True)
    measurements = serializers.SerializerMethodField()
    evidences = WorkOrderEvidenceSerializer(many=True, read_only=True)
    signatures = WorkOrderSignatureSerializer(many=True, read_only=True)
    cost = WorkOrderCostSerializer(read_only=True)
    activities = WorkOrderActivitySerializer(many=True, read_only=True)

    class Meta(EquipmentWorkOrderSerializer.Meta):
        fields = EquipmentWorkOrderSerializer.Meta.fields + (
            "spare_parts",
            "measurements",
            "evidences",
            "signatures",
            "cost",
            "activities",
        )

    def get_measurements(self, obj):
        # `WorkOrderMeasurement.work_order` no define related_name, así que el
        # acceso inverso es `workordermeasurement_set`.
        return WorkOrderMeasurementSerializer(
            obj.workordermeasurement_set.all(), many=True
        ).data