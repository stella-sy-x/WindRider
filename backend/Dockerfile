FROM python:3.14-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# One process on purpose: race rooms live in its memory.
# Only Caddy (same compose network, port not published) can reach this, so its
# X-Forwarded-For is trusted: request.client.host is then the player's address (rate limits)
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
