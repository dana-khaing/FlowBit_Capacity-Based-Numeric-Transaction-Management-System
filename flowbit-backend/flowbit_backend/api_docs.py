from django.http import HttpResponse
from django.urls import reverse
from rest_framework.permissions import AllowAny
from rest_framework.renderers import JSONOpenAPIRenderer
from rest_framework.schemas import get_schema_view


schema_view = get_schema_view(
    title="FlowBit API",
    description="OpenAPI schema for FlowBit backend endpoints.",
    version="1.0.0",
    public=True,
    permission_classes=[AllowAny],
    renderer_classes=[JSONOpenAPIRenderer],
)


def swagger_ui_view(request):
    schema_url = request.build_absolute_uri(reverse("api-schema"))
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FlowBit API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({{
      url: "{schema_url}",
      dom_id: '#swagger-ui',
      deepLinking: true,
      displayRequestDuration: true,
      persistAuthorization: true,
    }});
  </script>
</body>
</html>"""
    return HttpResponse(html)


def redoc_view(request):
    schema_url = request.build_absolute_uri(reverse("api-schema"))
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FlowBit API Reference</title>
</head>
<body>
  <redoc spec-url="{schema_url}"></redoc>
  <script src="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js"></script>
</body>
</html>"""
    return HttpResponse(html)
