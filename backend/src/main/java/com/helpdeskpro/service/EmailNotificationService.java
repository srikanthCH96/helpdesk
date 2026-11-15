package com.helpdeskpro.service;

import com.helpdeskpro.model.Notification;
import com.helpdeskpro.model.Ticket;
import com.helpdeskpro.model.User;
import com.helpdeskpro.repository.NotificationRepository;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class EmailNotificationService {
    private static final Logger log = LoggerFactory.getLogger(EmailNotificationService.class);

    private final JavaMailSender mailSender;
    private final NotificationRepository notificationRepository;
    private final boolean mailEnabled;
    private final String fromAddress;

    public EmailNotificationService(
            JavaMailSender mailSender,
            NotificationRepository notificationRepository,
            @Value("${app.mail.enabled:false}") boolean mailEnabled,
            @Value("${app.mail.from:no-reply@helpdeskpro.io}") String fromAddress) {
        this.mailSender = mailSender;
        this.notificationRepository = notificationRepository;
        this.mailEnabled = mailEnabled;
        this.fromAddress = fromAddress;
    }

    public void notifyUser(User recipient, Ticket ticket, String title, String message, String eventType) {
        Notification notif = new Notification();
        notif.setUser(recipient);
        notif.setTicket(ticket);
        notif.setTitle(title);
        notif.setMessage(message);
        notif.setEventType(eventType);
        notificationRepository.save(notif);

        sendHtmlEmailAsync(recipient.getEmail(), title, buildHtmlTemplate(recipient.getFullName(), title, message, ticket));
    }

    @Async
    public void sendHtmlEmailAsync(String to, String subject, String htmlBody) {
        if (!mailEnabled) {
            log.info("[SMTP Dev Adapter] Would send email to={} subject='{}'", to, subject);
            return;
        }
        try {
            MimeMessage msg = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, "UTF-8");
            helper.setFrom(fromAddress);
            helper.setTo(to);
            helper.setSubject("[HelpDesk Pro] " + subject);
            helper.setText(htmlBody, true);
            mailSender.send(msg);
        } catch (Exception ex) {
            log.warn("SMTP dispatch failed for {}: {}", to, ex.getMessage());
        }
    }

    private String buildHtmlTemplate(String recipientName, String title, String message, Ticket ticket) {
        String ticketLine = ticket != null
                ? "<p style=\"font-family:monospace;color:#1e40af;\">Ticket: " + ticket.getTicketNumber() + " — " + ticket.getSubject() + "</p>"
                : "";
        return """
            <html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;">
              <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
                <h2 style="margin-top:0;color:#0f172a;">HelpDesk Pro Enterprise Suite</h2>
                <p style="color:#334155;">Hello %s,</p>
                <h3 style="color:#1e293b;">%s</h3>
                %s
                <p style="color:#475569;line-height:1.5;">%s</p>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>
                <p style="font-size:12px;color:#64748b;">Automated notification from HelpDesk Pro IT Service Management.</p>
              </div>
            </body></html>
            """.formatted(recipientName, title, ticketLine, message);
    }
}
