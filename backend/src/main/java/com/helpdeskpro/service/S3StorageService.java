package com.helpdeskpro.service;

import java.io.IOException;
import java.nio.file.*;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

@Service
public class S3StorageService {
    private static final Set<String> ALLOWED_EXTENSIONS =
            Set.of(".png", ".jpg", ".jpeg", ".pdf", ".txt", ".log", ".csv", ".docx", ".xlsx");
    private static final Set<String> ALLOWED_MIMES = Set.of(
            "image/png", "image/jpeg", "application/pdf", "text/plain", "text/csv",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    private static final long MAX_BYTES = 10L * 1024 * 1024;

    private final String s3Bucket;
    private final String awsRegion;
    private final Path localDir;

    public S3StorageService(
            @Value("${app.storage.s3-bucket:}") String s3Bucket,
            @Value("${app.storage.aws-region:us-east-1}") String awsRegion,
            @Value("${app.storage.local-upload-dir:./uploads}") String localUploadDir) {
        this.s3Bucket = s3Bucket;
        this.awsRegion = awsRegion;
        this.localDir = Paths.get(localUploadDir).toAbsolutePath().normalize();
    }

    public boolean isS3Enabled() {
        return s3Bucket != null && !s3Bucket.isBlank()
                && System.getenv("AWS_ACCESS_KEY_ID") != null
                && !System.getenv("AWS_ACCESS_KEY_ID").isBlank();
    }

    public StoredFileResult storeFile(Long ticketId, MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Attachment file is required.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new IllegalArgumentException("File exceeds maximum allowed size of 10MB.");
        }
        String original = file.getOriginalFilename() == null ? "file" : file.getOriginalFilename();
        String ext = original.contains(".") ? original.substring(original.lastIndexOf('.')).toLowerCase() : "";
        if (!ALLOWED_EXTENSIONS.contains(ext) || !ALLOWED_MIMES.contains(file.getContentType())) {
            throw new IllegalArgumentException("Unsupported attachment file type or MIME type.");
        }

        String key = "tickets/" + ticketId + "/" + UUID.randomUUID() + ext;
        if (isS3Enabled()) {
            try (S3Client s3 = S3Client.builder().region(Region.of(awsRegion)).build()) {
                s3.putObject(
                        PutObjectRequest.builder()
                                .bucket(s3Bucket)
                                .key(key)
                                .contentType(file.getContentType())
                                .build(),
                        RequestBody.fromBytes(file.getBytes()));
                return new StoredFileResult(key, "AWS_S3");
            }
        } else {
            Files.createDirectories(localDir.resolve("tickets/" + ticketId));
            Path dest = localDir.resolve(key);
            Files.write(dest, file.getBytes());
            return new StoredFileResult(key, "LOCAL_DEV_ADAPTER");
        }
    }

    public byte[] loadFile(String key, String provider) throws IOException {
        if ("AWS_S3".equals(provider) && isS3Enabled()) {
            try (S3Client s3 = S3Client.builder().region(Region.of(awsRegion)).build()) {
                return s3.getObjectAsBytes(
                        GetObjectRequest.builder().bucket(s3Bucket).key(key).build()).asByteArray();
            }
        }
        return Files.readAllBytes(localDir.resolve(key));
    }

    public record StoredFileResult(String storageKey, String provider) {}
}
