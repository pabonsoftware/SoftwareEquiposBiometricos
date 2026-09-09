"""conftest global (rootdir). Ajustes que valen para toda la suite."""
import pytest


@pytest.fixture(autouse=True)
def _in_memory_channel_layer(settings):
    """Los tests no tienen Redis: la capa de canales corre en memoria.

    Basta para verificar que se emiten los eventos correctos; el transporte
    real (Redis entre procesos) es responsabilidad de la infra, no de la suite.
    """
    settings.CHANNEL_LAYERS = {
        "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"},
    }
