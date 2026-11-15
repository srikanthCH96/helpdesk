package com.helpdeskpro.repository;

import com.helpdeskpro.model.*;
import com.helpdeskpro.model.Enums.*;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoleRepository extends JpaRepository<Role, Long> {
    Optional<Role> findByName(RoleName name);
}
