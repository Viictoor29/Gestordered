package es.unex.cume.gestodered.data.model;

import org.bson.types.ObjectId;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "role_requests")
public class RoleRequest {

    @Id
    private String id;

    private ObjectId userId;
    private String username;
    private String fullName;
    private String email;
    private String dni;
    private String phone;
    private String passwordHash;
    private String currentRole;
    private String requestedRole;
    private String reason;
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
