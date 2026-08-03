import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    @staticmethod
    def configured() -> bool:
        return bool(settings.smtp_server and settings.smtp_username and settings.smtp_password)

    @staticmethod
    def send(to: str, subject: str, body: str) -> bool:
        if not EmailService.configured():
            logger.error("Email not sent to %s: SMTP is not configured", to)
            return False

        msg = EmailMessage()
        msg["From"] = settings.email_from
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)

        try:
            with smtplib.SMTP(settings.smtp_server, settings.smtp_port, timeout=15) as smtp:
                smtp.starttls()
                smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(msg)
            return True
        except Exception as exc:
            logger.error("Failed to send email to %s: %s", to, exc)
            return False

    @staticmethod
    def send_password_reset(to: str, token: str) -> bool:
        link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"
        return EmailService.send(
            to,
            "Reset your Scripting Smith password",
            f"Use the link below to choose a new password. It expires in "
            f"{settings.password_reset_expire_hours} hours.\n\n{link}\n\n"
            f"If you did not request this, you can ignore this email.",
        )

    @staticmethod
    def send_verification(to: str, token: str) -> bool:
        link = f"{settings.frontend_url.rstrip('/')}/verify-email?token={token}"
        return EmailService.send(
            to,
            "Verify your Scripting Smith email",
            f"Confirm your email address using the link below.\n\n{link}",
        )
