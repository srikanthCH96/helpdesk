package com.helpdeskpro.controller;

import com.helpdeskpro.dto.ApiResponse;
import com.helpdeskpro.model.*;
import com.helpdeskpro.model.Enums.*;
import com.helpdeskpro.repository.*;
import com.helpdeskpro.service.S3StorageService;
import com.helpdeskpro.service.TicketService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.io.IOException;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/tickets")
public class TicketController {
    private final TicketRepository ticketRepository;
    private final TicketCommentRepository commentRepository;
    private final TicketAttachmentRepository attachmentRepository;
    private final TicketService ticketService;
    private final S3StorageService storageService;

    public TicketController(
            TicketRepository ticketRepository,
            TicketCommentRepository commentRepository,
            TicketAttachmentRepository attachmentRepository,
            TicketService ticketService,
            S3StorageService storageService) {
        this.ticketRepository = ticketRepository;
        this.commentRepository = commentRepository;
        this.attachmentRepository = attachmentRepository;
        this.ticketService = ticketService;
        this.storageService = storageService;
    }

    public record CreateTicketRequest(@NotBlank String subject, @NotBlank String description,
                                      @NotNull Long categoryId, @NotNull TicketPriority priority, Long departmentId) {}
    public record AssignRequest(Long agentId, String notes) {}
    public record StatusRequest(@NotNull TicketStatus status, String reason) {}
    public record CommentRequest(@NotBlank String body, boolean internalNote) {}
    public record ResolveRequest(@NotBlank String resolutionSummary) {}

    @GetMapping
    public ResponseEntity<ApiResponse<Page<Ticket>>> listTickets(
            @AuthenticationPrincipal User currentUser,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        boolean isAdmin = hasRole(currentUser, RoleName.ADMIN);
        boolean isAgent = hasRole(currentUser, RoleName.SUPPORT_AGENT);

        Page<Ticket> result;
        if (isAdmin) {
            result = ticketRepository.findAll(pageable);
        } else if (isAgent) {
            result = ticketRepository.findByAssignedAgentIdOrAssignedAgentIsNull(currentUser.getId(), pageable);
        } else {
            result = ticketRepository.findByRequesterId(currentUser.getId(), pageable);
        }
        return ResponseEntity.ok(ApiResponse.ok(result));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<Ticket>> getTicket(
            @AuthenticationPrincipal User currentUser,
            @PathVariable Long id) {
        Ticket ticket = ticketRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found."));
        if (!hasRole(currentUser, RoleName.ADMIN) && !hasRole(currentUser, RoleName.SUPPORT_AGENT)
                && !ticket.getRequester().getId().equals(currentUser.getId())) {
            throw new AccessDeniedException("Employees cannot view other employees' private tickets.");
        }
        return ResponseEntity.ok(ApiResponse.ok(ticket));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Ticket>> createTicket(
            @AuthenticationPrincipal User currentUser,
            @Valid @RequestBody CreateTicketRequest req) {
        Ticket created = ticketService.createTicket(
                currentUser, req.subject(), req.description(),
                req.categoryId(), req.priority(), req.departmentId());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(created));
    }

    @PostMapping("/{id}/assign")
    @PreAuthorize("hasAnyRole('ADMIN','SUPPORT_AGENT')")
    public ResponseEntity<ApiResponse<Ticket>> assignTicket(
            @AuthenticationPrincipal User currentUser,
            @PathVariable Long id,
            @RequestBody AssignRequest req) {
        Long targetAgent = hasRole(currentUser, RoleName.SUPPORT_AGENT) && !hasRole(currentUser, RoleName.ADMIN)
                ? currentUser.getId()
                : req.agentId();
        Ticket updated = ticketService.assignTicket(id, targetAgent, currentUser, req.notes());
        return ResponseEntity.ok(ApiResponse.ok(updated));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<ApiResponse<Ticket>> updateStatus(
            @AuthenticationPrincipal User currentUser,
            @PathVariable Long id,
            @Valid @RequestBody StatusRequest req) {
        Ticket updated = ticketService.transitionStatus(id, req.status(), currentUser, req.reason());
        return ResponseEntity.ok(ApiResponse.ok(updated));
    }

    @PostMapping("/{id}/resolve")
    @PreAuthorize("hasAnyRole('ADMIN','SUPPORT_AGENT')")
    public ResponseEntity<ApiResponse<Ticket>> resolveTicket(
            @AuthenticationPrincipal User currentUser,
            @PathVariable Long id,
            @Valid @RequestBody ResolveRequest req) {
        Ticket resolved = ticketService.resolveTicket(id, currentUser, req.resolutionSummary());
        return ResponseEntity.ok(ApiResponse.ok(resolved));
    }

    @PostMapping("/{id}/reopen")
    public ResponseEntity<ApiResponse<Ticket>> reopenTicket(
            @AuthenticationPrincipal User currentUser,
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        Ticket reopened = ticketService.transitionStatus(
                id, TicketStatus.OPEN, currentUser, body.getOrDefault("reason", "Reopened"));
        return ResponseEntity.ok(ApiResponse.ok(reopened));
    }

    @PostMapping("/{id}/comments")
    public ResponseEntity<ApiResponse<TicketComment>> addComment(
            @AuthenticationPrincipal User currentUser,
            @PathVariable Long id,
            @Valid @RequestBody CommentRequest req) {
        Ticket ticket = ticketRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found."));
        boolean internal = req.internalNote() && (hasRole(currentUser, RoleName.ADMIN) || hasRole(currentUser, RoleName.SUPPORT_AGENT));

        TicketComment comment = new TicketComment();
        comment.setTicket(ticket);
        comment.setAuthor(currentUser);
        comment.setBody(req.body());
        comment.setInternalNote(internal);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(commentRepository.save(comment)));
    }

    @PostMapping("/{id}/attachments")
    public ResponseEntity<ApiResponse<TicketAttachment>> uploadAttachment(
            @AuthenticationPrincipal User currentUser,
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) throws IOException {
        Ticket ticket = ticketRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found."));
        var stored = storageService.storeFile(id, file);

        TicketAttachment att = new TicketAttachment();
        att.setTicket(ticket);
        att.setUploadedBy(currentUser);
        att.setOriginalFileName(file.getOriginalFilename());
        att.setStorageKey(stored.storageKey());
        att.setMimeType(file.getContentType());
        att.setSizeBytes(file.getSize());
        att.setStorageProvider(stored.provider());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(attachmentRepository.save(att)));
    }

    @GetMapping("/attachments/{attachmentId}/download")
    public ResponseEntity<byte[]> downloadAttachment(
            @AuthenticationPrincipal User currentUser,
            @PathVariable Long attachmentId) throws IOException {
        TicketAttachment att = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new IllegalArgumentException("Attachment not found."));
        if (!hasRole(currentUser, RoleName.ADMIN) && !hasRole(currentUser, RoleName.SUPPORT_AGENT)
                && !att.getTicket().getRequester().getId().equals(currentUser.getId())) {
            throw new AccessDeniedException("Access denied.");
        }
        byte[] content = storageService.loadFile(att.getStorageKey(), att.getStorageProvider());
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + att.getOriginalFileName() + "\"")
                .contentType(MediaType.parseMediaType(att.getMimeType()))
                .body(content);
    }

    private boolean hasRole(User user, RoleName roleName) {
        return user.getRoles().stream().anyMatch(r -> r.getName() == roleName);
    }
}
