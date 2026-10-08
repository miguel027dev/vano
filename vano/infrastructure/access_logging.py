from gunicorn.glogging import Logger
from vano.security.redaction import redact_path


class PrivacyLogger(Logger):
    def atoms(self, resp, req, environ, request_time):
        atoms = super().atoms(resp, req, environ, request_time)
        atoms["U"] = redact_path(atoms.get("U", ""))
        atoms["q"] = ""
        atoms["r"] = f'{environ.get("REQUEST_METHOD", "")} {atoms["U"]} {environ.get("SERVER_PROTOCOL", "")}'
        # Shared URLs may also appear in the referrer.
        atoms["f"] = redact_path(atoms.get("f", "-"))
        return atoms
