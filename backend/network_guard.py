"""Canonical Outbound Network Guard for Royal Libas Test Environments.

Guarantees:
1. Blocks outbound socket-level connections (socket.connect and socket.connect_ex).
2. Blocks outbound synchronous and asynchronous HTTP requests (httpx.Client.send and httpx.AsyncClient.send).
3. Permits loopback addresses (127.0.0.1, localhost, ::1) and in-memory ASGI transports (testserver).
"""

import socket

_ALLOWED_HOSTS = ("127.0.0.1", "localhost", "::1", "testserver")

_orig_socket_connect = socket.socket.connect
_orig_socket_connect_ex = socket.socket.connect_ex


def is_allowed_address(address) -> bool:
    """Check if address is an allowed local loopback or in-memory ASGI address."""
    if isinstance(address, tuple) and len(address) > 0:
        host = str(address[0]).lower().strip()
        return host in _ALLOWED_HOSTS
    elif isinstance(address, str):
        return address.lower().strip() in _ALLOWED_HOSTS
    return False


def guarded_socket_connect(self, address):
    if is_allowed_address(address):
        return _orig_socket_connect(self, address)
    raise RuntimeError(
        f"CRITICAL NETWORK SAFETY VIOLATION: Outbound socket connection to '{address}' "
        "was blocked by the test runner network guard!"
    )


def guarded_socket_connect_ex(self, address):
    if is_allowed_address(address):
        return _orig_socket_connect_ex(self, address)
    raise RuntimeError(
        f"CRITICAL NETWORK SAFETY VIOLATION: Outbound socket connect_ex to '{address}' "
        "was blocked by the test runner network guard!"
    )


socket.socket.connect = guarded_socket_connect
socket.socket.connect_ex = guarded_socket_connect_ex

try:
    import httpx

    _orig_httpx_send = httpx.Client.send

    def guarded_httpx_send(self, request, *args, **kwargs):
        host = (request.url.host or "").lower().strip()
        if host in _ALLOWED_HOSTS:
            return _orig_httpx_send(self, request, *args, **kwargs)
        raise RuntimeError(
            f"CRITICAL NETWORK SAFETY VIOLATION: Outbound sync HTTP request to '{request.url}' "
            "was blocked by the test runner network guard!"
        )

    httpx.Client.send = guarded_httpx_send

    _orig_httpx_async_send = httpx.AsyncClient.send

    async def guarded_httpx_async_send(self, request, *args, **kwargs):
        host = (request.url.host or "").lower().strip()
        if host in _ALLOWED_HOSTS:
            return await _orig_httpx_async_send(self, request, *args, **kwargs)
        raise RuntimeError(
            f"CRITICAL NETWORK SAFETY VIOLATION: Outbound async HTTP request to '{request.url}' "
            "was blocked by the test runner network guard!"
        )

    httpx.AsyncClient.send = guarded_httpx_async_send
except ImportError:
    pass
