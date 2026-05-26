package es.unex.cume.gestodered.data.repository;

import es.unex.cume.gestodered.data.model.RoleRequest;
import org.bson.types.ObjectId;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface RoleRequestRepository extends MongoRepository<RoleRequest, String> {

    List<RoleRequest> findByStatus(String status);

    List<RoleRequest> findByEmail(String email);

    List<RoleRequest> findByDni(String dni);

    List<RoleRequest> findByUsername(String username);

    List<RoleRequest> findByUserId(ObjectId userId);

    Optional<RoleRequest> findByUserIdAndStatus(ObjectId userId, String status);

    Optional<RoleRequest> findByDniAndStatus(String dni, String status);

    Optional<RoleRequest> findByEmailAndStatus(String email, String status);

    Optional<RoleRequest> findByUsernameAndStatus(String username, String status);

    Optional<RoleRequest> findFirstByCurrentRoleAndDniOrderByCreatedAtDesc(String currentRole, String dni);

    Optional<RoleRequest> findFirstByCurrentRoleAndEmailOrderByCreatedAtDesc(String currentRole, String email);

    Optional<RoleRequest> findFirstByCurrentRoleAndUsernameOrderByCreatedAtDesc(String currentRole, String username);
}
