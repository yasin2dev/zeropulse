package storage

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	bolt "go.etcd.io/bbolt"
	"golang.org/x/crypto/bcrypt"
)

var (
	bucketUsers    = []byte("users")
	bucketSessions = []byte("sessions")
	bucketSystem   = []byte("system")

	keyInitialized = []byte("initialized")
)

var (
	ErrUserNotFound      = errors.New("kullanıcı bulunamadı")
	ErrUserAlreadyExists = errors.New("bu kullanıcı adı zaten mevcut")
	ErrInvalidPassword   = errors.New("geçersiz şifre")
	ErrSessionNotFound   = errors.New("oturum bulunamadı veya süresi dolmuş")
	ErrAlreadyInit       = errors.New("sistem zaten başlatılmış")
	ErrCannotDeleteAdmin = errors.New("son yönetici hesabı veya mevcut kullanıcı silinemez")
)

// User represents a system operator in Zeropulse.
type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"password_hash,omitempty"`
	Role         string    `json:"role"` // "admin" or "viewer"
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// UserSafe is the public representation of a user without password hash.
type UserSafe struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Session represents an active authenticated session.
type Session struct {
	Token     string    `json:"token"`
	Username  string    `json:"username"`
	Role      string    `json:"role"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// Store wraps bbolt database for persistence.
type Store struct {
	mu sync.RWMutex
	db *bolt.DB
}

// Open creates or opens the bbolt database file at dbPath.
func Open(dbPath string) (*Store, error) {
	dir := filepath.Dir(dbPath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0750); err != nil {
			return nil, fmt.Errorf("veritabanı dizini oluşturulamadı (%s): %w", dir, err)
		}
	}

	db, err := bolt.Open(dbPath, 0600, &bolt.Options{Timeout: 2 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("bbolt veritabanı açılamadı (%s): %w", dbPath, err)
	}

	// Initialize buckets
	err = db.Update(func(tx *bolt.Tx) error {
		for _, b := range [][]byte{bucketUsers, bucketSessions, bucketSystem} {
			if _, err := tx.CreateBucketIfNotExists(b); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("veritabanı bucket'ları hazırlanamadı: %w", err)
	}

	return &Store{db: db}, nil
}

// Close gracefully closes the underlying bbolt database.
func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

// IsInitialized checks if the superuser setup has been completed.
func (s *Store) IsInitialized() (bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var init bool
	err := s.db.View(func(tx *bolt.Tx) error {
		sys := tx.Bucket(bucketSystem)
		val := sys.Get(keyInitialized)
		if val != nil && string(val) == "true" {
			// Verify at least one admin exists
			users := tx.Bucket(bucketUsers)
			c := users.Cursor()
			for k, v := c.First(); k != nil; k, v = c.Next() {
				var u User
				if err := json.Unmarshal(v, &u); err == nil && u.Role == "admin" {
					init = true
					return nil
				}
			}
		}
		return nil
	})
	return init, err
}

// CreateSuperuser sets up the initial superuser account. Fails if already initialized.
func (s *Store) CreateSuperuser(username, password string) (*UserSafe, error) {
	username = strings.TrimSpace(strings.ToLower(username))
	if len(username) < 3 {
		return nil, errors.New("kullanıcı adı en az 3 karakter olmalıdır")
	}
	if len(password) < 6 {
		return nil, errors.New("şifre en az 6 karakter olmalıdır")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	var safeUser UserSafe
	err := s.db.Update(func(tx *bolt.Tx) error {
		sys := tx.Bucket(bucketSystem)
		if val := sys.Get(keyInitialized); val != nil && string(val) == "true" {
			return ErrAlreadyInit
		}

		users := tx.Bucket(bucketUsers)
		now := time.Now().UTC()
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("şifre hashlenemedi: %w", err)
		}

		user := User{
			ID:           generateRandomHex(8),
			Username:     username,
			PasswordHash: string(hash),
			Role:         "admin",
			CreatedAt:    now,
			UpdatedAt:    now,
		}

		data, err := json.Marshal(user)
		if err != nil {
			return err
		}

		if err := users.Put([]byte(username), data); err != nil {
			return err
		}

		if err := sys.Put(keyInitialized, []byte("true")); err != nil {
			return err
		}

		safeUser = UserSafe{
			ID:        user.ID,
			Username:  user.Username,
			Role:      user.Role,
			CreatedAt: user.CreatedAt,
			UpdatedAt: user.UpdatedAt,
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return &safeUser, nil
}

// Authenticate verifies username and password, returning UserSafe if valid.
func (s *Store) Authenticate(username, password string) (*UserSafe, error) {
	username = strings.TrimSpace(strings.ToLower(username))
	s.mu.RLock()
	defer s.mu.RUnlock()

	var safeUser UserSafe
	err := s.db.View(func(tx *bolt.Tx) error {
		users := tx.Bucket(bucketUsers)
		data := users.Get([]byte(username))
		if data == nil {
			return ErrUserNotFound
		}

		var u User
		if err := json.Unmarshal(data, &u); err != nil {
			return err
		}

		if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
			return ErrInvalidPassword
		}

		safeUser = UserSafe{
			ID:        u.ID,
			Username:  u.Username,
			Role:      u.Role,
			CreatedAt: u.CreatedAt,
			UpdatedAt: u.UpdatedAt,
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return &safeUser, nil
}

// CreateSession generates a new authenticated session token for the user.
func (s *Store) CreateSession(username, role string, ttl time.Duration) (*Session, error) {
	token := generateRandomHex(32)
	now := time.Now().UTC()
	sess := Session{
		Token:     token,
		Username:  username,
		Role:      role,
		ExpiresAt: now.Add(ttl),
		CreatedAt: now,
	}

	data, err := json.Marshal(sess)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	err = s.db.Update(func(tx *bolt.Tx) error {
		sessions := tx.Bucket(bucketSessions)
		return sessions.Put([]byte(token), data)
	})
	if err != nil {
		return nil, err
	}
	return &sess, nil
}

// GetSession retrieves and validates an active session token.
func (s *Store) GetSession(token string) (*Session, error) {
	if token == "" {
		return nil, ErrSessionNotFound
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	var sess Session
	var expired bool

	err := s.db.View(func(tx *bolt.Tx) error {
		sessions := tx.Bucket(bucketSessions)
		data := sessions.Get([]byte(token))
		if data == nil {
			return ErrSessionNotFound
		}

		if err := json.Unmarshal(data, &sess); err != nil {
			return err
		}

		if time.Now().UTC().After(sess.ExpiresAt) {
			expired = true
			return ErrSessionNotFound
		}
		return nil
	})

	if expired {
		// Clean up expired session asynchronously in background
		go func() {
			_ = s.DeleteSession(token)
		}()
	}

	if err != nil {
		return nil, err
	}
	return &sess, nil
}

// DeleteSession invalidates and deletes a session token.
func (s *Store) DeleteSession(token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.db.Update(func(tx *bolt.Tx) error {
		sessions := tx.Bucket(bucketSessions)
		return sessions.Delete([]byte(token))
	})
}

// ListUsers returns all registered users without password hashes.
func (s *Store) ListUsers() ([]UserSafe, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var list []UserSafe
	err := s.db.View(func(tx *bolt.Tx) error {
		users := tx.Bucket(bucketUsers)
		return users.ForEach(func(k, v []byte) error {
			var u User
			if err := json.Unmarshal(v, &u); err != nil {
				return nil
			}
			list = append(list, UserSafe{
				ID:        u.ID,
				Username:  u.Username,
				Role:      u.Role,
				CreatedAt: u.CreatedAt,
				UpdatedAt: u.UpdatedAt,
			})
			return nil
		})
	})
	return list, err
}

// CreateUser creates an additional user (role: "admin" or "viewer").
func (s *Store) CreateUser(username, password, role string) (*UserSafe, error) {
	username = strings.TrimSpace(strings.ToLower(username))
	if len(username) < 3 {
		return nil, errors.New("kullanıcı adı en az 3 karakter olmalıdır")
	}
	if len(password) < 6 {
		return nil, errors.New("şifre en az 6 karakter olmalıdır")
	}
	if role != "admin" && role != "viewer" {
		role = "viewer"
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	var safeUser UserSafe
	err := s.db.Update(func(tx *bolt.Tx) error {
		users := tx.Bucket(bucketUsers)
		if users.Get([]byte(username)) != nil {
			return ErrUserAlreadyExists
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}

		now := time.Now().UTC()
		u := User{
			ID:           generateRandomHex(8),
			Username:     username,
			PasswordHash: string(hash),
			Role:         role,
			CreatedAt:    now,
			UpdatedAt:    now,
		}

		data, err := json.Marshal(u)
		if err != nil {
			return err
		}

		if err := users.Put([]byte(username), data); err != nil {
			return err
		}

		safeUser = UserSafe{
			ID:        u.ID,
			Username:  u.Username,
			Role:      u.Role,
			CreatedAt: u.CreatedAt,
			UpdatedAt: u.UpdatedAt,
		}
		return nil
	})

	if err != nil {
		return nil, err
	}
	return &safeUser, nil
}

// DeleteUser removes a user, ensuring at least one admin remains.
func (s *Store) DeleteUser(username, operatorUsername string) error {
	username = strings.TrimSpace(strings.ToLower(username))
	operatorUsername = strings.TrimSpace(strings.ToLower(operatorUsername))

	if username == operatorUsername {
		return errors.New("kendi hesabınızı silemezsiniz")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.db.Update(func(tx *bolt.Tx) error {
		users := tx.Bucket(bucketUsers)
		targetData := users.Get([]byte(username))
		if targetData == nil {
			return ErrUserNotFound
		}

		var target User
		if err := json.Unmarshal(targetData, &target); err != nil {
			return err
		}

		if target.Role == "admin" {
			// Count total admins
			adminCount := 0
			_ = users.ForEach(func(k, v []byte) error {
				var u User
				if err := json.Unmarshal(v, &u); err == nil && u.Role == "admin" {
					adminCount++
				}
				return nil
			})
			if adminCount <= 1 {
				return ErrCannotDeleteAdmin
			}
		}

		return users.Delete([]byte(username))
	})
}

// UpdatePassword updates an existing user's password.
func (s *Store) UpdatePassword(username, newPassword string) error {
	username = strings.TrimSpace(strings.ToLower(username))
	if len(newPassword) < 6 {
		return errors.New("şifre en az 6 karakter olmalıdır")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.db.Update(func(tx *bolt.Tx) error {
		users := tx.Bucket(bucketUsers)
		data := users.Get([]byte(username))
		if data == nil {
			return ErrUserNotFound
		}

		var u User
		if err := json.Unmarshal(data, &u); err != nil {
			return err
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
		if err != nil {
			return err
		}

		u.PasswordHash = string(hash)
		u.UpdatedAt = time.Now().UTC()

		updatedData, err := json.Marshal(u)
		if err != nil {
			return err
		}

		return users.Put([]byte(username), updatedData)
	})
}

// ResetPassword resets or creates an admin user with newPassword directly from CLI.
func (s *Store) ResetPassword(username, newPassword string) error {
	username = strings.TrimSpace(strings.ToLower(username))
	if username == "" {
		username = "admin"
	}
	if len(newPassword) < 6 {
		return errors.New("şifre en az 6 karakter olmalıdır")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("şifre hashlenemedi: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.db.Update(func(tx *bolt.Tx) error {
		users := tx.Bucket(bucketUsers)
		sys := tx.Bucket(bucketSystem)

		now := time.Now().UTC()
		var u User
		data := users.Get([]byte(username))
		if data != nil {
			if err := json.Unmarshal(data, &u); err != nil {
				return err
			}
			u.PasswordHash = string(hash)
			u.Role = "admin" // ensure admin privileges on reset
			u.UpdatedAt = now
		} else {
			u = User{
				ID:           generateRandomHex(8),
				Username:     username,
				PasswordHash: string(hash),
				Role:         "admin",
				CreatedAt:    now,
				UpdatedAt:    now,
			}
		}

		encoded, err := json.Marshal(u)
		if err != nil {
			return err
		}

		if err := users.Put([]byte(username), encoded); err != nil {
			return err
		}

		return sys.Put(keyInitialized, []byte("true"))
	})
}

func generateRandomHex(byteLen int) string {
	b := make([]byte, byteLen)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
