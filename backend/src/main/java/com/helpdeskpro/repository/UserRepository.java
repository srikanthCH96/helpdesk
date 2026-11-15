package com.helpdeskpro.repository;

import com.helpdeskpro.model.User;
import com.helpdeskpro.model.Enums.RoleName;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmailIgnoreCase(String email);
    boolean existsByEmailIgnoreCase(String email);
    List<User> findByRolesNameAndActiveTrue(RoleName roleName);
}
