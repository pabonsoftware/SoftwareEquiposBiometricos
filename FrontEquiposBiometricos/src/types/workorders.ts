export type WorkOrderServiceType =
    | "PREVENTIVE"
    | "CORRECTIVE"
    | "CALIBRATION"
    | "INSTALLATION"
    | "INSPECTION"

export type WorkOrderStatus =
    | "PENDING"
    | "IN_PROGRESS"
    | "FINISHED"
    | "CANCELLED"

export type EvidenceType = "PHOTO" | "VIDEO" | "DOCUMENT" | "AUDIO"

export type SignatureRole = "TECHNICIAN" | "ENGINEER" | "CLIENT" | "SUPERVISOR"

export interface WorkOrderSparePart {
    id:number;
    work_order:number;
    name:string;
    reference:string;
    quantity:number;
    unit_cost:string;
    total_cost:string;
}

export interface WorkOrderEvidence {
    id:number;
    work_order:number;
    evidence_type:EvidenceType;
    description:string;
    file?:string | null;
}

export interface WorkOrderCost {
    id:number;
    work_order:number;
    labor_cost:string;
    spare_parts_cost:string;
    transport_cost:string;
    other_cost:string;
}

export interface WorkOrderSignature {
    id:number;
    work_order:number;
    role:SignatureRole;
    signed_by:string;
    signed_at:string;
}

export interface WorkOrderMeasurement {
    id:number;
    work_order:number;
    parameter:string;
    expected_value:string;
    measured_value:string;
    unit:string;
    passed:boolean;
}

export interface WorkOrderScheduleInfo {
    id:number;
    kind:"PREVENTIVE" | "REPAIR";
    scheduled_date: string | null;
    is_completed:boolean;
}

export interface WorkOrder {
    id:number;
    equipment:number;
    equipment_name?:string;
    equipment_asset_tag?: string;
    number:string;
    service_type:WorkOrderServiceType;
    service_type_display?: string | null;
    start_date:string;
    end_date?:string;
    description:string;
    technician?: number | null;
    technician_name?: string | null;
    status: WorkOrderStatus;
    status_display?: string;
    report?: string | null;
    schedule?: number | null;
    schedule_info?:WorkOrderScheduleInfo | null;
    created_at?:string;
}

export interface WorkOrderDetail extends WorkOrder {
    spare_parts: WorkOrderSparePart[];
    measurements: WorkOrderMeasurement[];
    evidences: WorkOrderEvidence[];
    signatures: WorkOrderSignature[];
    cost: WorkOrderCost | null;
}

export interface WorkOrderInput {
    equipment:number;
    number:string;
    service_type:WorkOrderServiceType;
    start_date: string;
    end_date?: string | null;
    description:string;
    technician?:number | null;
    status: WorkOrderStatus;
}