"""Paginación por defecto de la API v1.

La política de "cuántos elementos por página" vive acá (backend), no en el
cliente: el frontend solo renderiza lo que el backend le entrega.
"""

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardResultsSetPagination(PageNumberPagination):
    """Paginación estándar. El cliente puede ajustar el tamaño con
    ``?page_size=`` hasta un tope de ``max_page_size``."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class QrCodePagination(PageNumberPagination):
    """Listado de códigos QR de equipos.

    Como máximo **20 por página** y el cliente **no** puede cambiarlo
    (``page_size_query_param = None``): la regla es del backend. La respuesta
    incluye ``page_size`` para que el frontend no tenga que asumir el número.
    """

    page_size = 20
    page_size_query_param = None

    def get_paginated_response(self, data) -> Response:
        return Response(
            {
                "count": self.page.paginator.count,
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "page_size": self.get_page_size(self.request),
                "results": data,
            }
        )
