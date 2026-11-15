package com.helpdeskpro.controller;

import com.helpdeskpro.dto.ApiResponse;
import com.helpdeskpro.model.*;
import com.helpdeskpro.model.Enums.RoleName;
import com.helpdeskpro.repository.*;
import com.helpdeskpro.security.JwtTokenProvider;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final DepartmentRepository departmentRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    public AuthController(
            UserRepository userRepository,
            RoleRepository roleRepository,
            DepartmentRepository departmentRepository,
            PasswordResetTokenRepository tokenRepository,
            PasswordEncoder passwordEncoder,
            JwtTokenProvider jwtTokenProvider) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.departmentRepository = departmentRepository;
        this.tokenRepository = tokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    public record LoginRequest(@Email @NotBlank String email, @NotBlank String password) {}
    public record RegisterRequest(@NotBlank String fullName, @Email @NotBlank String email,
                                  @NotBlank String password, Long departmentId, String jobTitle, String phone) {}
    public record ForgotRequest(@Email @NotBlank String email) {}
    public record ResetRequest(@NotBlank String token, @NotBlank String newPassword) {}

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<Map<String, Object>>> login(@Valid @RequestBody LoginRequest req) {
        User user = userRepository.findByEmailIgnoreCase(req.email().trim())
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password."));
        if (!passwordEncoder.matches(req.password(), user.getPasswordHash())) {
            throw new IllegalArgumentException("Invalid email or password.");
        }
        if (!user.isActive()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiResponse.error("Account is deactivated."));
        }

        String primaryRole = user.getRoles().stream().findFirst()
                .map(r -> r.getName().name()).orElse("EMPLOYEE");
        String accessToken = jwtTokenProvider.generateAccessToken(user.getId(), user.getEmail(), primaryRole);
        String refreshToken = jwtTokenProvider.generateRefreshToken(user.getId(), user.getEmail(), primaryRole);

        return ResponseEntity.ok(ApiResponse.ok(Map.of(
                "accessToken", accessToken,
                "refreshToken", refreshToken,
                "user", Map.of(
                        "id", user.getId(),
                        "fullName", user.getFullName(),
                        "email", user.getEmail(),
                        "role", primaryRole
                )
        )));
    }

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<Map<String, Object>>> register(@Valid @RequestBody RegisterRequest req) {
        if (userRepository.existsByEmailIgnoreCase(req.email().trim())) {
            throw new IllegalStateException("Email address is already registered.");
        }
        Department dept = departmentRepository.findById(req.departmentId() != null ? req.departmentId() : 1L)
                .orElseThrow(() -> new IllegalArgumentException("Department not found."));
        Role employeeRole = roleRepository.findByName(RoleName.EMPLOYEE)
                .orElseThrow(() -> new IllegalStateException("EMPLOYEE role missing."));

        User user = new User();
        user.setFullName(req.fullName().trim());
        user.setEmail(req.email().trim().toLowerCase());
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user.setDepartment(dept);
        user.setJobTitle(req.jobTitle() != null ? req.jobTitle() : "Employee");
        user.setPhone(req.phone() != null ? req.phone() : "");
        user.setRoles(Set.of(employeeRole));
        User saved = userRepository.save(user);

        String accessToken = jwtTokenProvider.generateAccessToken(saved.getId(), saved.getEmail(), "EMPLOYEE");
        String refreshToken = jwtTokenProvider.generateRefreshToken(saved.getId(), saved.getEmail(), "EMPLOYEE");
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(Map.of(
                "accessToken", accessToken,
                "refreshToken", refreshToken,
                "userId", saved.getId()
        )));
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<ApiResponse<Void>> forgotPassword(@Valid @RequestBody ForgotRequest req) {
        userRepository.findByEmailIgnoreCase(req.email().trim()).ifPresent(user -> {
            PasswordResetToken prt = new PasswordResetToken();
            prt.setUser(user);
            prt.setToken(UUID.randomUUID().toString());
            prt.setExpiresAt(Instant.now().plus(30, ChronoUnit.MINUTES));
            tokenRepository.save(prt);
        });
        return ResponseEntity.ok(ApiResponse.ok("If the email exists, reset instructions were sent.", null));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(@Valid @RequestBody ResetRequest req) {
        PasswordResetToken prt = tokenRepository.findByTokenAndUsedFalse(req.token().trim())
                .orElseThrow(() -> new IllegalArgumentException("Invalid or used reset token."));
        if (prt.getExpiresAt().isBefore(Instant.now())) {
            throw new IllegalArgumentException("Reset token has expired.");
        }
        User user = prt.getUser();
        user.setPasswordHash(passwordEncoder.encode(req.newPassword()));
        userRepository.save(user);
        prt.setUsed(true);
        tokenRepository.save(prt);
        return ResponseEntity.ok(ApiResponse.ok("Password updated successfully.", null));
    }
}
