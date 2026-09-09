from decimal import Decimal
from typing import TYPE_CHECKING

from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from api.v1.helpers.semaforizacion import SemaphoreStatus, calculate_status, worst
from apps.branches.models import Branch

from .managers import EquipmentManager

if TYPE_CHECKING:
    from apps.maintenance.models import MaintenanceRecord
    from apps.users.models import User

class EquipmentStatus(models.TextChoices):
    ACTIVE = "ACTIVE", _("Operativo")
    INACTIVE = "INACTIVE", _("Fuera de servicio")
    IN_MAINTENANCE = "IN_MAINTENANCE", _("En mantenimiento")
    IN_REPAIR = "IN_REPAIR", _("En reparación")


class RiskClass(models.TextChoices):
    I = "I", _("Clase I — riesgo bajo")  # noqa: E741
    IIA = "IIA", _("Clase IIA — riesgo moderado")
    IIB = "IIB", _("Clase IIB — riesgo moderado-alto")
    III = "III", _("Clase III — riesgo alto")

class TechnologyType(models.TextChoices):
    ELECTRONIC = "ELECTRONIC",_("Electrónico")
    ELECTROMEDICAL = "ELECTROMEDICAL",("Electromédico")
    MECHANICAL = "MECHANICAL",_("Mecánico")
    MIXED = "MIXED",_("Mixto")
    OTHER = "OTHER",_("Otro")

class InstructionType(models.TextChoices):

    PREVENTIVE = "PREVENTIVE",_("Preventivo")
    CORRECTIVE = "CORRECTIVE",_("Correctivo")
    CALIBRATION = "CALIBRATION",_("Calibración")

class AttachmentType(models.TextChoices):

    LIFE_SHEET = "LIFE_SHEET",_("Hoja de Vida")

    MANUAL = "MANUAL",_("Manual")

    PHOTO = "PHOTO", _("Fotografía")

    CERTIFICATE = "CERTIFICATE", _("Certificado")

    WARRANTY = "WARRANTY", _("Garantía")

    PURCHASE = "PURCHASE", _("Compra")

    OTHER = "OTHER",_("Otro")

class WorkOrderType(models.TextChoices):

    PREVENTIVE = "PREVENTIVE", _("Preventivo")

    CORRECTIVE = "CORRECTIVE", _("Correctivo")

    CALIBRATION = "CALIBRATION",_("Calibración")

    INSTALLATION = "INSTALLATION",_("Instalación")

    INSPECTION = "INSPECTION",_("Inspección")

class WorkOrderStatus(models.TextChoices):
    # Máquina de estados única (RF008/RF011/§9). Las transiciones válidas viven
    # en apps/equipment/workflow.py y solo se ejecutan vía las acciones del
    # ViewSet (approve / start / complete / cancel), nunca por PATCH directo.
    PENDING = "PENDING", _("Pendiente")

    APPROVED = "APPROVED", _("Aprobada")

    IN_PROGRESS = "IN_PROGRESS", _("En proceso")

    FINISHED = "FINISHED", _("Terminada")

    CANCELLED = "CANCELLED", _("Cancelada")

class EvidenceType(models.TextChoices):

    PHOTO = "PHOTO",_("Fotografía")

    VIDEO = "VIDEO",_("Video")

    DOCUMENT = "DOCUMENT",_("Documento")

    AUDIO = "AUDIO",_("Audio")

class SignatureRole(models.TextChoices):

    TECHNICIAN = "TECHNICIAN"

    ENGINEER = "ENGINEER"

    CLIENT = "CLIENT"

    SUPERVISOR = "SUPERVISOR"

class Equipment(models.Model):
    # Identificación
    name = models.CharField(_("Nombre"), max_length=150)
    asset_tag = models.CharField(
        _("Placa / código de inventario"), max_length=50, unique=True, db_index=True
    )
    serial = models.CharField(_("Serie"),max_length=80,blank=True,db_index=True)
    internal_code = models.CharField(_("Código N.T."),max_length=50,blank=True)
    software_identifier = models.CharField(
        _("Identificador Software (Id)"),max_length=50,blank=True,db_index=True
    )
    equipment_model = models.ForeignKey(
        "catalog.EquipmentModel",
        on_delete=models.PROTECT,
        related_name="equipment",
        verbose_name=_("Modelo"),
    )
    branch_text = models.CharField(
        _("Marca (texto)"),
        max_length=120,
        blank=True,
        help_text=_("Útil si la marca no existe en catálogo."),
    )

    technology_type = models.CharField(
        _("Tipo tecnología"),
        max_length=30,
        choices=TechnologyType.choices,
        null=True,
        blank=True
    )

    biomedical_classification = models.CharField(
        _("Clasificación biomédica"),
        max_length=50,
        blank=True,
    )
    risk_class = models.CharField(
        _("Clasificación de riesgo INVIMA"),
        max_length=4,
        choices=RiskClass.choices,
        null=True,
        blank=True,
        db_index=True
    )

    life_use_years = models.PositiveIntegerField(_("Vida útil (años)"),null=True)
    manufacture_date = models.DateField(_("Fecha de fabricación"),null=True,blank=True)
    owner = models.CharField(_("Propietario"),max_length=150,blank=True)
    manufacturer = models.CharField(_("Fabricante"),max_length=150,blank=True)
    calibration_date = models.CharField(_("Código de calibración"),max_length=50,blank=True)

    client_name = models.CharField(_("Cliente"),max_length=180,blank=True)
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name="equipment",
        verbose_name=_("Sede"),
    )
    department = models.CharField(_("Departamento"),max_length=80,blank=True)
    city = models.CharField(_("Ciudad"),max_length=80,blank=True)
    area = models.CharField(_("Área"),max_length=120,blank=True)
    location = models.CharField(_("Ubicación"), max_length=120, blank=True)
    observations = models.TextField(_("Observaciones"),blank=True)
    purchase_date = models.DateField(_("Fecha de compra"), null=True, blank=True)
    supplier_acquisition = models.CharField(_("Proveedor de adquisión"),max_length=150,blank=True)
    start_use_date = models.DateField(_("Fecha inicia funcionamiento"),null=True,blank=True)
    equipment_cost = models.DecimalField(
        _("Costo equipo"),
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
    )
    maintenance_provider = models.CharField(_("Proveedor de mantenimiento"),max_length=150,blank=True)
    warranty_start_date = models.DateField(_("Fecha inicia garantía"),null=True,blank=True)
    warranty_end_date = models.DateField(_("Fecha finaliza garantía"),null=True,blank=True)
    calibration_frequency_months = models.PositiveIntegerField(
        _("Frecuencia calibración (meses)"),
        null=True,
        blank=True,
    )
    maintenance_frequency_months = models.PositiveIntegerField(
        _("Frecuencia mantenimiento (meses)"),
        null=True,
        blank=True,
    )

    ecri = models.CharField(_("ECRI"),max_length=80,blank=True)
    invima_registration = models.CharField(_("Registro Invima"),max_length=80,blank=True)
    electrical_safety_class = models.CharField(_("Clase seguridad eléctrica"),max_length=80,blank=True)
    electrical_safety_type = models.CharField(_("Tipo seguridad eléctrica"),max_length=80,blank=True)
    status = models.CharField(
        _("Estado"),
        max_length=20,
        choices=EquipmentStatus.choices,
        default=EquipmentStatus.ACTIVE,
        db_index=True,
    )

    last_calibration = models.CharField(_("Última calibración"),max_length=120,blank=True)
    last_preventive = models.CharField(_("Último preventivo"),max_length=120,blank=True)
    next_preventive = models.CharField(_("Próximo preventivo"),max_length=120,blank=True)
    next_preventive_date = models.DateField(_("Fecha de Próximo Preventivo"),null=True,blank=True)
    next_calibration = models.CharField(_("Próxima calibración"),max_length=120,blank=True)
    next_calibration_date = models.DateField(
        _("Fecha de Próxima Calibración"), null=True, blank=True
    )
    corrective_count = models.PositiveIntegerField(_("Número de correctivos."),default=0)

    qr_code = models.FileField(_("Código QR"), upload_to="equipment/qr/", blank=True)
    equipment_image = models.ImageField(_("Imagen del equipo"),upload_to="equipment/image",blank=True,null=True)
    life_sheet_pdf = models.FileField(_("Hoja Vida PDF"),upload_to="equipment/life_sheet",blank=True)
    mtbf_hours = models.DecimalField(
        _("MTBF (horas)"),
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_(
            "Tiempo promedio entre fallas consecutivas. Recalculado automáticamente."
        ),
    )
    mttr_hours = models.DecimalField(
        _("MTTR (horas)"),
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text=_(
            "Tiempo promedio para resolver una falla. Recalculado automáticamente."
        ),
    )
    created_at = models.DateTimeField(_("Creado"), auto_now_add=True)
    updated_at = models.DateTimeField(_("Actualizado"), auto_now=True)

    objects = EquipmentManager()

    # Ventanas de aviso del semáforo (RF010). Días antes del vencimiento en que
    # el indicador pasa a 🟡. Aquí, no como número mágico dentro del helper.
    PREVENTIVE_WARNING_DAYS = 30
    CALIBRATION_WARNING_DAYS = 45

    class Meta:
        verbose_name = _("Equipo biomédico")
        verbose_name_plural = _("Equipos biomédicos")
        ordering = ["name"]
        indexes = [
            models.Index(fields=["asset_tag"], name="equipment_asset_tag_idx"),
            models.Index(fields=["branch"], name="equipment_branch_idx"),
            models.Index(fields=["status"], name="equipment_status_idx"),
            models.Index(fields=["equipment_model"], name="equipment_model_idx"),
            models.Index(fields=["risk_class"], name="equipment_risk_class_idx"),
            models.Index(fields=["serial"],name="equipment_serial_idx"),
            models.Index(fields=["software_identifier"],name="equipment_sw_id_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.asset_tag})"

    @property
    def preventive_status(self) -> SemaphoreStatus:
        """Semáforo del mantenimiento preventivo (RF010).

        Calculado al vuelo: siempre refleja la fecha de hoy, sin campo guardado
        ni tarea que lo mantenga. `timezone.localdate()` (no `date.today()`)
        para respetar la zona horaria del proyecto, igual que el resto del código.
        """
        return calculate_status(
            due_date=self.next_preventive_date,
            today=timezone.localdate(),
            warning_days=self.PREVENTIVE_WARNING_DAYS,
        )

    @property
    def calibration_status(self) -> SemaphoreStatus:
        """Semáforo del aseguramiento metrológico / calibración (RF010)."""
        return calculate_status(
            due_date=self.next_calibration_date,
            today=timezone.localdate(),
            warning_days=self.CALIBRATION_WARNING_DAYS,
        )

    @property
    def maintenance_semaphore(self) -> SemaphoreStatus:
        """Semáforo global del equipo: el *peor* entre preventivo y calibración.
        Es el que se pinta en el listado y en el dashboard."""
        return worst(self.preventive_status, self.calibration_status)


class EquipmentInstruction(models.Model):

    equipment = models.ForeignKey(
        Equipment,
        on_delete=models.CASCADE,
        related_name="instructions",   
    )

    instruction_type = models.CharField(
        max_length=20,
        choices=InstructionType.choices,
        default=InstructionType.PREVENTIVE,
    )

    sequence = models.PositiveIntegerField()

    activity = models.TextField()

    class Meta:

        ordering = ["instruction_type","sequence"]

    def __str__(self):

        return f"{self.equipment.name} - {self.sequence}"

class EquipmentCertificate(models.Model):

    equipment = models.ForeignKey(
        Equipment,
        on_delete=models.CASCADE,
        related_name="certificates",
    )

    certificate_number = models.CharField(
        max_length=80,
        db_index=True,
    )

    certificate_date = models.DateField()

    responsible = models.CharField(
        max_length=150,
    )

    observations = models.TextField(
        blank=True,
    )

    file = models.FileField(
        upload_to="equipment/certificates/",
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:

        ordering = ["-certificate_date"]

    def __str__(self):
        return self.certificate_number

class EquipmentAttachment(models.Model):

    equipment = models.ForeignKey(
        Equipment,
        on_delete=models.CASCADE,
        related_name="attachments",
    )

    attachment_type = models.CharField(
        max_length=30,
        choices=AttachmentType.choices,
    )

    title = models.CharField(
        max_length=150,
    )

    file = models.FileField(
        upload_to="equipment/files/",
    )

    uploaded_at = models.DateTimeField(
        auto_now_add=True,
    )

    uploaded_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="equipment_attachments"
    )

    def __str__(self):

        return self.title


class EquipmentWorkOrder(models.Model):

    equipment = models.ForeignKey(
        Equipment,
        on_delete=models.CASCADE,
        related_name="work_orders",
    )

    number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True
    )

    service_type = models.CharField(
        max_length=20,
        choices=WorkOrderType.choices,
    )

    start_date = models.DateTimeField()

    end_date = models.DateTimeField(
        null=True,
        blank=True,
    )

    description = models.TextField()

    technician: "models.ForeignKey[User | None]" = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    status = models.CharField(
        max_length=20,
        choices=WorkOrderStatus.choices,
        default=WorkOrderStatus.PENDING,
    )

    report = models.FileField(
        upload_to="equipment/orders/",
        blank=True,
    )

    maintenance_record: "models.OneToOneField[MaintenanceRecord | None]" = models.OneToOneField(
        "maintenance.MaintenanceRecord",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_order",
    )

    # --- Trazabilidad de la máquina de estados (RF008/RF011/RFN009) ---
    approved_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_work_orders",
        verbose_name=_("Aprobada por"),
    )
    approved_at = models.DateTimeField(_("Aprobada el"), null=True, blank=True)
    closed_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="closed_work_orders",
        verbose_name=_("Cerrada por"),
    )
    closed_at = models.DateTimeField(_("Cerrada el"), null=True, blank=True)
    closing_notes = models.TextField(_("Observaciones de cierre"), blank=True)
    cancelled_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cancelled_work_orders",
        verbose_name=_("Cancelada por"),
    )
    cancelled_at = models.DateTimeField(_("Cancelada el"), null=True, blank=True)
    cancel_reason = models.TextField(_("Motivo de cancelación"), blank=True)

    created_at = models.DateTimeField(
        auto_now_add=True,
    )

    # Ventana de aviso del semáforo de la orden (RF010): pocos días, porque una
    # orden abierta es trabajo en curso, no una fecha lejana.
    SCHEDULE_WARNING_DAYS = 3
    CLOSED_STATUSES = (WorkOrderStatus.FINISHED, WorkOrderStatus.CANCELLED)

    class Meta:
        ordering = ["-start_date"]
        indexes = [
            models.Index(fields=["status"], name="workorder_status_idx"),
            models.Index(fields=["equipment", "-start_date"], name="workorder_eq_date_idx"),
        ]

    def __str__(self):

        return self.number

    @property
    def schedule_semaphore(self) -> SemaphoreStatus:
        """Semáforo de cumplimiento de la orden (RF010 §10).

        - TERMINADA / CANCELADA → 🟢 (sin acción pendiente).
        - Si no, se compara la fecha límite (`end_date` planificada, o
          `start_date` si no hay) contra hoy: pasada → 🔴, cercana → 🟡.
        """
        return calculate_status(
            due_date=self.end_date or self.start_date,
            today=timezone.localdate(),
            warning_days=self.SCHEDULE_WARNING_DAYS,
            completed=self.status in self.CLOSED_STATUSES,
        )

class WorkOrderSparePart(models.Model):

    work_order = models.ForeignKey(
        EquipmentWorkOrder,
        on_delete=models.CASCADE,
        related_name="spare_parts",
    )

    name = models.CharField(max_length=150)

    reference = models.CharField(max_length=80)

    quantity = models.PositiveIntegerField()

    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )

    total_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
    )

class WorkOrderMeasurement(models.Model):

    work_order = models.ForeignKey(
        EquipmentWorkOrder,
        on_delete=models.CASCADE,
    )

    parameter = models.CharField(max_length=120)

    expected_value = models.CharField(max_length=100)

    measured_value = models.CharField(max_length=100)

    unit = models.CharField(max_length=20)

    passed = models.BooleanField(default=True)


class WorkOrderEvidence(models.Model):

    work_order = models.ForeignKey(
        EquipmentWorkOrder,
        on_delete=models.CASCADE,
        related_name="evidences",
    )

    evidence_type = models.CharField(
        max_length=20,
        choices=EvidenceType.choices
    )

    description = models.CharField(max_length=250)

    file = models.FileField(
        upload_to="equipment/evidence/",
        blank=True,
    )

class WorkOrderSignature(models.Model):

    work_order = models.ForeignKey(
        EquipmentWorkOrder,
        on_delete=models.CASCADE,
        related_name="signatures",
    )

    role = models.CharField(
        max_length=20,
        choices=SignatureRole.choices,
    )

    signed_by = models.CharField(
        max_length=150,
    )

    signed_at = models.DateTimeField(auto_now_add=True)

class WorkOrderCost(models.Model):

    work_order = models.OneToOneField(
        EquipmentWorkOrder,
        on_delete=models.CASCADE,
        related_name='cost',
    )

    labor_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0"),
    )

    spare_parts_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0"),
    )

    transport_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0"),
    )

    other_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0"),
    )


class WorkOrderActivity(models.Model):
    """Tarea/actividad técnica registrada durante la ejecución de la orden
    (RF009). Al registrar la primera, la orden pasa de APROBADA a EN_PROCESO.
    El cierre de la orden (RF011) exige al menos una de estas actividades."""

    work_order = models.ForeignKey(
        EquipmentWorkOrder,
        on_delete=models.CASCADE,
        related_name="activities",
        verbose_name=_("Orden de trabajo"),
    )
    performed_at = models.DateTimeField(_("Fecha y hora"), default=timezone.now)
    performed_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="work_order_activities",
        verbose_name=_("Responsable"),
    )
    description = models.TextField(_("Actividad realizada"))
    findings = models.TextField(_("Hallazgos / diagnóstico encontrado"), blank=True)
    recommendations = models.TextField(_("Recomendaciones"), blank=True)
    hourmeter = models.DecimalField(
        _("Horómetro / kilometraje"),
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
    )
    equipment_status_after = models.CharField(
        _("Estado operativo del equipo tras la intervención"),
        max_length=20,
        choices=EquipmentStatus.choices,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Actividad de orden de trabajo")
        verbose_name_plural = _("Actividades de orden de trabajo")
        ordering = ["performed_at", "id"]
        indexes = [
            models.Index(fields=["work_order", "performed_at"], name="wo_activity_wo_date_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.work_order.number} · {self.performed_at:%Y-%m-%d %H:%M}"


