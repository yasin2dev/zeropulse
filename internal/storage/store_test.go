package storage

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestStorageLifecycle(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "zeropulse-store-test-*")
	if err != nil {
		t.Fatalf("temp dir oluşturulamadı: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbPath := filepath.Join(tmpDir, "test.db")
	store, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer store.Close()

	// 1. Initialized check should be false
	init, err := store.IsInitialized()
	if err != nil {
		t.Fatalf("IsInitialized failed: %v", err)
	}
	if init {
		t.Errorf("expected not initialized initially")
	}

	// 2. Create Superuser
	admin, err := store.CreateSuperuser("admin", "supersecret123")
	if err != nil {
		t.Fatalf("CreateSuperuser failed: %v", err)
	}
	if admin.Username != "admin" || admin.Role != "admin" {
		t.Errorf("unexpected admin fields: %+v", admin)
	}

	// 3. Second CreateSuperuser should fail
	_, err = store.CreateSuperuser("admin2", "supersecret123")
	if err != ErrAlreadyInit {
		t.Errorf("expected ErrAlreadyInit, got %v", err)
	}

	// 4. IsInitialized should now be true
	init, err = store.IsInitialized()
	if err != nil || !init {
		t.Errorf("expected initialized true, got %v (err: %v)", init, err)
	}

	// 5. Authenticate with correct and wrong password
	_, err = store.Authenticate("admin", "wrongpass")
	if err != ErrInvalidPassword {
		t.Errorf("expected ErrInvalidPassword, got %v", err)
	}

	authAdmin, err := store.Authenticate("admin", "supersecret123")
	if err != nil {
		t.Fatalf("Authenticate failed: %v", err)
	}
	if authAdmin.Username != "admin" {
		t.Errorf("expected username admin, got %s", authAdmin.Username)
	}

	// 6. Session management
	sess, err := store.CreateSession("admin", "admin", 1*time.Hour)
	if err != nil {
		t.Fatalf("CreateSession failed: %v", err)
	}
	if len(sess.Token) != 64 {
		t.Errorf("expected 64 char hex token, got len %d", len(sess.Token))
	}

	gotSess, err := store.GetSession(sess.Token)
	if err != nil || gotSess.Username != "admin" {
		t.Fatalf("GetSession failed or mismatch: %v", err)
	}

	// 7. Expired session
	shortSess, err := store.CreateSession("admin", "admin", -1*time.Minute)
	if err != nil {
		t.Fatalf("CreateSession expired failed: %v", err)
	}
	_, err = store.GetSession(shortSess.Token)
	if err != ErrSessionNotFound {
		t.Errorf("expected ErrSessionNotFound for expired session, got %v", err)
	}

	// 8. User creation (additional viewer)
	viewer, err := store.CreateUser("viewer1", "viewerpass123", "viewer")
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	if viewer.Role != "viewer" {
		t.Errorf("expected viewer role, got %s", viewer.Role)
	}

	// 9. List users
	users, err := store.ListUsers()
	if err != nil || len(users) != 2 {
		t.Errorf("expected 2 users, got %d (err: %v)", len(users), err)
	}

	// 10. Delete user safeguards
	err = store.DeleteUser("admin", "admin")
	if err == nil {
		t.Errorf("expected error deleting self, got nil")
	}

	err = store.DeleteUser("viewer1", "admin")
	if err != nil {
		t.Errorf("failed deleting viewer: %v", err)
	}

	usersAfter, _ := store.ListUsers()
	if len(usersAfter) != 1 {
		t.Errorf("expected 1 user after delete, got %d", len(usersAfter))
	}

	// 11. Cannot delete last admin
	err = store.DeleteUser("admin", "other")
	if err != ErrCannotDeleteAdmin {
		t.Errorf("expected ErrCannotDeleteAdmin, got %v", err)
	}

	// 12. Reset password from CLI
	err = store.ResetPassword("admin", "brandnewpass123")
	if err != nil {
		t.Fatalf("ResetPassword failed: %v", err)
	}
	authRes, err := store.Authenticate("admin", "brandnewpass123")
	if err != nil || authRes.Username != "admin" {
		t.Fatalf("Authenticate after ResetPassword failed: %v", err)
	}
}
