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

    List<RoleRequest> findByUserId(ObjectId userId);

    Optional<RoleRequest> findByDniAndStatus(String dni, String status);

    Optional<RoleRequest> findByEmailAndStatus(String email, String status);
}