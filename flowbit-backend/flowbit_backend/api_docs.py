from django.conf import settings
from django.http import HttpResponse
from django.urls import reverse
from rest_framework.permissions import BasePermission
from rest_framework.renderers import JSONOpenAPIRenderer
from rest_framework.schemas import get_schema_view

from core.permissions import is_admin_user


class DocsAccessPermission(BasePermission):
    def has_permission(self, request, view):
        if settings.DEBUG:
            return True
        return bool(request.user and request.user.is_authenticated and is_admin_user(request.user))


schema_view = get_schema_view(
    title="FlowBit API",
    description="""
FlowBit backend API for periods, ledgers, tickets, spill-over, archive, lucky draw, notifications, support, and admin workflows.

Authentication:
- Most endpoints require `Authorization: Token <token>`
- Use `/api/auth/login/` or `/api/auth/google/` to obtain a token

Operational notes:
- `GET /api/periods/current/` returns `{ "period": null }` when no active period exists
- Realtime notifications are delivered over `/ws/notifications/`
- Admin-only routes remain protected outside `DEBUG`
""".strip(),
    version="1.3-beta",
    public=True,
    permission_classes=[DocsAccessPermission],
    renderer_classes=[JSONOpenAPIRenderer],
)


def swagger_ui_view(request):
    if not settings.DEBUG and not is_admin_user(request.user):
        return HttpResponse(status=403)
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
      docExpansion: 'list',
      defaultModelsExpandDepth: 1,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    }});
  </script>
</body>
</html>"""
    return HttpResponse(html)


def redoc_view(request):
    if not settings.DEBUG and not is_admin_user(request.user):
        return HttpResponse(status=403)
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
