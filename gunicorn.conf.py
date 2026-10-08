"""Bounded concurrency and privacy-preserving logs for the existing service."""
import os

bind = "0.0.0.0:" + os.environ.get("PORT", "8000")
workers = 1
threads = 6
timeout = 120
keepalive = 10
accesslog = "-"
errorlog = "-"
logger_class = "vano.infrastructure.access_logging.PrivacyLogger"
