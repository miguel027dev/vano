"""Keep public resource caching independent of account session cookies."""
from flask import request
from flask.sessions import SecureCookieSessionInterface

PUBLIC_RESOURCE_ENDPOINTS = frozenset({
    'static', 'healthz', 'web_app_manifest', 'vano_service_worker', 'android_asset_links',
})


class ResourceSessionInterface(SecureCookieSessionInterface):
    def save_session(self, app, session, response):
        # Flask's default permanent-session refresh sends Set-Cookie and
        # Vary: Cookie even when a CSS/JS request never used the session.
        # Account pages keep the normal sliding expiration and cookie policy.
        if request.endpoint in PUBLIC_RESOURCE_ENDPOINTS and not session.modified:
            return
        super().save_session(app, session, response)
