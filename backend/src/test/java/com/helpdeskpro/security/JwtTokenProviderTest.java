package com.helpdeskpro.security;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class JwtTokenProviderTest {

    @Test
    void generateAndValidateAccessToken_succeeds() {
        JwtTokenProvider provider = new JwtTokenProvider(
                "helpdesk-pro-unit-test-secret-key-at-least-32-bytes-long-2026",
                3600_000L,
                86400_000L);

        String token = provider.generateAccessToken(42L, "admin@helpdeskpro.io", "ADMIN");
        assertTrue(provider.validateToken(token));

        var claims = provider.parseClaims(token);
        assertEquals("admin@helpdeskpro.io", claims.getSubject());
        assertEquals(42L, claims.get("userId", Long.class));
        assertEquals("ADMIN", claims.get("role", String.class));
    }

    @Test
    void validateToken_rejectsTamperedToken() {
        JwtTokenProvider provider = new JwtTokenProvider(
                "helpdesk-pro-unit-test-secret-key-at-least-32-bytes-long-2026",
                3600_000L,
                86400_000L);

        assertFalse(provider.validateToken("invalid.jwt.token"));
    }
}
