package es.unex.cume.gestodered.data.model;

import org.bson.types.ObjectId;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.IndexDirection;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.Map;

@Document(collection = "topologies")
public class Topology {

    @Id
    private String id;

    @Indexed(name = "name_1", unique = true)
    private String name;
    private String description;
    private Map<String, Object> data;
    @Indexed(name = "createdBy_1")
    private ObjectId createdBy;
    @Indexed(name = "createdAt_-1", direction = IndexDirection.DESCENDING)
    private Instant createdAt;
    private Instant updatedAt;

    public Topology() {
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public Map<String, Object> getData() {
        return data;
    }

    public ObjectId getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setId(String id) {
        this.id = id;
    }

    public void setName(String name) {
        this.name = name;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public void setData(Map<String, Object> data) {
        this.data = data;
    }

    public void setCreatedBy(ObjectId createdBy) {
        this.createdBy = createdBy;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
