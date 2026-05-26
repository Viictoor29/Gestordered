package es.unex.cume.gestodered.data.model;

import org.bson.types.ObjectId;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "role_requests")
@CompoundIndexes({
        @CompoundIndex(
                name = "dni_1_status_1",
                def = "{ 'dni': 1, 'status': 1 }",
                unique = true,
                partialFilter = "{ 'status': 'PENDING' }"),
        @CompoundIndex(
                name = "email_1_status_1",
                def = "{ 'email': 1, 'status': 1 }",
                unique = true,
                partialFilter = "{ 'status': 'PENDING' }"),
        @CompoundIndex(
                name = "username_1_status_1",
                def = "{ 'username': 1, 'status': 1 }",
                unique = true,
                partialFilter = "{ 'status': 'PENDING' }")
})
public class RoleRequest {

    @Id
    private String id;

    @Indexed(name = "userId_1")
    private ObjectId userId;
    private String username;
    private String fullName;
    @Indexed(name = "email_1")
    private String email;
    @Indexed(name = "dni_1")
    private String dni;
    private String phone;
    private String passwordHash;
    private String currentRole;
    private String requestedRole;
    private String reason;
    private String rejectionReason;
    @Indexed(name = "status_1")
    private String status;
    private ObjectId reviewedBy;
    private Instant createdAt;
    private Instant reviewedAt;

    public RoleRequest() {
    }

    public String getId() {
        return id;
    }

    public ObjectId getUserId() {
        return userId;
    }

    public String getUsername() {
        return username;
    }

    public String getFullName() {
        return fullName;
    }

    public String getEmail() {
        return email;
    }

    public String getDni() {
        return dni;
    }

    public String getPhone() {
        return phone;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getCurrentRole() {
        return currentRole;
    }

    public String getRequestedRole() {
        return requestedRole;
    }

    public String getReason() {
        return reason;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    public String getStatus() {
        return status;
    }

    public ObjectId getReviewedBy() {
        return reviewedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getReviewedAt() {
        return reviewedAt;
    }

    public void setId(String id) {
        this.id = id;
    }

    public void setUserId(ObjectId userId) {
        this.userId = userId;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public void setDni(String dni) {
        this.dni = dni;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public void setCurrentRole(String currentRole) {
        this.currentRole = currentRole;
    }

    public void setRequestedRole(String requestedRole) {
        this.requestedRole = requestedRole;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public void setReviewedBy(ObjectId reviewedBy) {
        this.reviewedBy = reviewedBy;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public void setReviewedAt(Instant reviewedAt) {
        this.reviewedAt = reviewedAt;
    }
}
