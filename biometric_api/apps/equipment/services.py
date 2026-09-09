
from io import BytesIO
from typing import cast

import qrcode
from django.conf import settings
from django.core.files.base import ContentFile
from django.utils import timezone
from qrcode.image.pil import PilImage

from .models import Equipment, EquipmentWorkOrder


def generate_work_order_number(equipment: Equipment) -> str:
    """Número de orden legible y único: OT-<YYYYMMDD>-<asset_tag>[-n]."""
    base = f"OT-{timezone.localdate():%Y%m%d}-{equipment.asset_tag}"
    number, i = base, 2
    while EquipmentWorkOrder.objects.filter(number=number).exists():
        number = f"{base}-{i}"
        i += 1
    return number


def build_qr_payload(equipment: Equipment) -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return f"{base}/equipment/{equipment.id}"


def generate_qr_for_equipment(equipment: Equipment) -> None:
    """Genera el PNG del QR para `equipment` y lo guarda en `equipment.qr_code`.

    El payload codificado apunta al detalle del equipo en el frontend usando
    `id` (inmutable) en vez de `asset_tag`, así un re-etiquetado no invalida
    QRs ya impresos.
    """
    payload = build_qr_payload(equipment)
    # `qrcode.make` está tipado como `BaseImage` (cuyo `.save()` solo acepta
    # `kind`), pero sin `image_factory` siempre devuelve un `PilImage`, cuyo
    # `.save()` reenvía `format` a Pillow.
    img = cast(PilImage, qrcode.make(payload))

    buffer = BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    # Borra el PNG anterior (si lo hay) para que el storage reescriba el mismo
    # nombre `equipment_<id>.png` en vez de acumular copias con sufijo aleatorio
    # (`equipment_<id>_a1B2c3.png`) en cada regeneración.
    if equipment.qr_code:
        equipment.qr_code.delete(save=False)

    filename = f"equipment_{equipment.id}.png"
    equipment.qr_code.save(filename, ContentFile(buffer.read()), save=False)
    equipment.save(update_fields=["qr_code", "updated_at"])
