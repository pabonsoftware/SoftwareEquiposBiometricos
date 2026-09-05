from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from .models import (
    Equipment,
    EquipmentAttachment,
    EquipmentInstruction,
    EquipmentCertificate,
    EquipmentWorkOrder,
    WorkOrderCost,
    WorkOrderEvidence,
    WorkOrderMeasurement,
    WorkOrderSignature,
    WorkOrderSparePart,
)


# =====================================
# INSTRUCIONES DEL EQUIPO 
# =====================================

class EquipmentInstructionInline(admin.TabularInline):

    model = EquipmentInstruction
    extra = 0
    fields = ("instruction_type","sequence","activity",)

    ordering = ("instruction_type","sequence",)

# ========================================
# INLINE: CERTIFICADOS DEL EQUIPO
# ========================================

class EquipmentCertificateInline(admin.TabularInline):

    model = EquipmentCertificate
    extra = 0
    fields = ("certificate_number","certificate_date","responsible","observations","file",)
    ordering = ("-certificate_date",)

# ===============================================
# INLINE: ARCHIVOS DEL EQUIPO 
# ===============================================

class EquipmentAttachmentInline(admin.TabularInline):

    model = EquipmentAttachment
    extra = 0
    fields = ("attachment_type","title","file","uploaded_by","uploaded_at",)
    readonly_fields = ("uploaded_at",)
    ordering = ("-uploaded_at",)

# =========================================
# INLINE: ÓRDENES DE TRABAJO DEL EQUIPO
# =========================================

class EquipmentWorkOrderInline(admin.TabularInline):

    model = EquipmentWorkOrder
    extra = 0
    fields = ("number","service_type","start_date","end_date","technician","status",)
    show_change_link = True
    ordering = ("-start_date",)

# =========================================
# INLINE: REPUESTOS
# =========================================
class WorkOrderSparePartInline(admin.TabularInline):

    model = WorkOrderSparePart
    extra = 0
    fields = ("name","reference","quantity","unit_cost","total_cost",)


# =========================================
# INLINE: MEDICIONES
# =========================================

class WorkOrderMeasurementInline(admin.TabularInline):

    model = WorkOrderMeasurement
    extra = 0
    fields = ("parameter","expected_value","measured_value","unit","passed",)

# ==========================================
# INLINE: EVIDENCIAS
# ==========================================

class WorkOrderEvidenceInline(admin.TabularInline):

    model = WorkOrderEvidence
    extra = 0
    fields = ("evidence_type","description","file",)

# ==========================================
# INLINE: FIRMAS 
# ==========================================

class WorkOrderSignatureInline(admin.TabularInline):

    model = WorkOrderSignature
    extra = 0
    fields = ("role""signed_by","signed_at",)
    read_only_fields = ("signed_at",)

# ====================================================
# INLINE: COSTOS
# ====================================================

class WorkOrderCostInline(admin.TabularInline):

    model = WorkOrderCost
    extra = 0
    max_num = 1
    fields = ("labor_cost","spare_parts_cost","transport_cost","other_cost",)


# ==========================================
# EQUIPMENT
# ==========================================
@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
    list_display = ("name","asset_tag","serial","equipment_model","branch","technology_type","risk_class","status","purchase_date","mtbf_hours","mttr_hours","created_at",)
    list_filter = ("status","technology_type","risk_class","biomedical_classification","electrical_safety_class","electrical_safety_type","branch",)
    search_fields = ("name","asset_tag","serial","software_identifier","manufacturer","owner","client_name","equipment_model__name","equipment_model__brand__name",)
    ordering = ("name",)
    readonly_fields = ("qr_code","mtbf_hours","mttr_hours", "created_at", "updated_at")
    autocomplete_fields = ("branch", "equipment_model")
    fieldsets = (
        (_("Identificación"), {"fields": ("name", "asset_tag","serial","internal_code","software_identifier")}),
        (_("Clasificación"),{"fields":("equipment_model","branch","branch_text","technology_type","biomedical_classification","risk_class",)}),
        (_("Información del equipo"),{"fields":("manufacturer","owner","client_name","department","city","area","location","observations")}),
        (_("Adquisición"),{"fields":("purchase_date","supplier_acquisition","equipment_cost","manufacture_date","start_use_date")}),
        (_("Garantía"),{"fields":("warranty_start_date","warranty_end_date")}),
        (_("Mantenimiento"),{"fields":("maintenance_provider","maintenance_frequency_months","last_preventive","next_preventive","corrective_count")},),
        (_("Calibración"),{"fields":("calibration_date","calibration_frequency_months","last_calibration","next_calibration")},),
        (_("Seguridad eléctrica"),{"fields":("invima_registration","ecri")}),
        (_("Vida útil"),{"fields":("life_use_years",)}),
        (_("Estado"),{"fields":("status",)}),
        (_("Archivos"),{"fields":("equipment_image","life_sheet_pdf","qr_code")}),
        (_("Confiabilidad"),{"fields":("mtbf_hours","mttr_hours")}),
        (_("Auditoría"), {"fields": ("created_at", "updated_at")}),
    )

    inlines = (
        EquipmentInstructionInline,
        EquipmentCertificateInline,
        EquipmentAttachmentInline,
        EquipmentWorkOrderInline
    )



# ===============================================================
# EQUIPMENT WORK ORDER
# ===============================================================

@admin.register(EquipmentWorkOrder)
class EquipmentWorkOrderAdmin(admin.ModelAdmin):

    list_display = (
        "number",
        "equipment",
        "service_type",
        "start_date",
        "end_date",
        "technician",
        "status",
    )

    list_filter = (
        "service_type",
        "status",
    )

    search_fields = (
        "number",
        "description",
        "equipment__name",
        "equipment__asset_tag",
        "technician__username",
        "technician__first_name",
        "technician__last_name",
    )

    ordering = (
        "-start_date",
    )

    autocomplete_fields = (
        "equipment",
        "technician",
    )

    readonly_fields = (
        "created_at",
    )

    fieldsets = (
        (
            "Identificación",
            {
                "fields":(
                    "number",
                    "equipment",
                )
            }
        ),
        (
            "Servicio",
            {
                "fields":(
                    "service_type",
                    "status",
                    "description",
                    "technician",
                )
            }
        ),
        (
            "Fechas",
            {
                "fields":(
                    "start_date",
                    "end_date",
                )
            },
        ),
        (
            "Informe",
            {
                "fields":(
                    "report",
                )
            },
        ),
        (
            "Auditoría",
            {
                "fields":(
                    "created_at",
                )
            }
        )
    )

    inlines = (
                WorkOrderSparePartInline,
                WorkOrderMeasurementInline,
                WorkOrderEvidenceInline,
                WorkOrderCostInline,
    )

# ====================================================================
# EQUIPMENT INSTRUCION
# ====================================================================

@admin.register(EquipmentInstruction)
class EquipmentInstructionAdmin(admin.ModelAdmin):

    list_display = (
        "equipment",
        "instruction_type",
        "sequence",
        "activity",
    )

    list_filter = (
        "instruction_type",
    )

    search_fields = (
        "equipment__name",
        "equipment__asset_tag",
        "activity",
    )

    ordering = (
        "equipment",
        "instruction_type",
        "sequence",
    )

    autocomplete_fields = (
        "equipment",

    )

# ===========================================================
# EQUIPMENT CERTIFICATE
# ===========================================================

@admin.register(EquipmentCertificate)
class EquipmentCertificateAdmin(admin.ModelAdmin):

    list_display = (
        "certificate_number",
        "equipment",
        "certificate_date",
        "responsible",
    )

    list_filter = (
        "certificate_date",
    )

    search_fields = (
        "certificate_number",
        "responsible",
        "equipment__name",
        "equipment__asset_tag",
    )

    ordering = (
        "-certificate_date",
    )

    autocomplete_fields = (
        "equipment",
    )

    readonly_fields = (
        "created_at",
    )

# ===================================================================
# EQUIPMENT ATTACHMENT
# ===================================================================

@admin.register(EquipmentAttachment)
class EquipmentAttachmentAdmin(admin.ModelAdmin):

    list_display = (
        "title",
        "equipment",
        "attachment_type",
        "uploaded_by",
        "uploaded_at",
    )

    list_filter = (
        "attachment_type",
    )

    search_fields = (
        "title",
        "equipment__name",
        "equipment__asset_tag",
    )

    ordering = (
        "-uploaded_at",
    )

    autocomplete_fields = (
        "equipment",
        "uploaded_by",
    )

    readonly_fields = (
        "uploaded_at",
    )


# ==================================================================
# WORK ORDER MEASUREMENT
# ==================================================================

@admin.register(WorkOrderMeasurement)
class WorkOrderMeaasurementAdmin(admin.ModelAdmin):

    list_display = (
        "parameter",
        "work_order",
        "expected_value",
        "measured_value",
        "unit",
        "passed"
    )

    list_filter = (
        "passed",
    )

    search_fields = (
        "parameter",
        "expected_value",
        "measured_value",
        "unit",
        "work_order__number",
    )

    autocomplete_fields =(
        "work_order",
    )

# ============================================================
# WORK ORDER EVIDENCE
# ============================================================

@admin.register(WorkOrderEvidence)
class WorkOrderEvidenceAdmin(admin.ModelAdmin):
    list_display = (
        "work_order",
        "evidence_type",
        "description",
    )

    list_filter = (
        "evidence_type",
    )

    search_fields = (
        "description",
        "work_order__number",
    )

    autocomplete_fields = (
        "work_order",
    )


# =================================================================
# WORK ORDER SIGNATURE
# =================================================================

@admin.register(WorkOrderSignature)
class WorkOrderSignatureAdmin(admin.ModelAdmin):

    list_display = (
        "work_order",
        "role",
        "signed_by",
        "signed_at",
    )

    list_filter = (
        "role",
    )

    search_fields = (
        "signed_by",
        "role",
        "work_order__number",
    )

    ordering = (
        "-signed_at",
    )

    autocomplete_fields = (
        "work_order",
    )

    readonly_fields = (
        "signed_at",
    )



# ==================================================================
# WORK ORDER COST
# ================================================================== 

@admin.register(WorkOrderCost)
class WorkOrderCost(admin.ModelAdmin):

    list_display = (
        "work_order",
        "labor_cost",
        "spare_parts_cost",
        "transport_cost",
        "other_cost"
    )
