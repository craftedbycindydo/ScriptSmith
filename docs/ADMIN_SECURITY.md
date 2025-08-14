# Admin Security Guidelines

This document outlines the secure admin access implementation and best practices for the Online IDE Platform.

## Security Improvements Made

### ❌ Previous Insecure Implementation
- **Hardcoded admin emails** in frontend components (`'k@p.com'`)
- **Single admin email** limitation via environment variable
- **Frontend-backend inconsistency** in admin checking
- **No role-based access control (RBAC)**
- **Unsecured admin management**

### ✅ New Secure Implementation
- **Role-based access control (RBAC)** with database roles
- **Multiple admin emails** support via environment variables
- **Secure admin service** with comprehensive authorization
- **Frontend API-based** admin verification
- **Protected admin management** endpoints

## Role-Based Access Control (RBAC)

### User Roles
```typescript
enum UserRole {
  USER = "user",        // Regular users
  MODERATOR = "moderator", // Can moderate content (future use)
  ADMIN = "admin"       // Full administrative access
}
```

### Admin Access Methods
1. **Role-based**: Users with `role = ADMIN` in database
2. **Legacy support**: Users with `is_superuser = true` flag
3. **Environment-based**: Users whose emails are in `ADMIN_EMAILS` config

## Environment Configuration

### Development Example
```bash
# Admin Settings - REQUIRED (comma-separated for multiple admins)
# SECURITY: These emails will have admin access regardless of role in database
# Use secure email addresses and limit to trusted administrators only
ADMIN_EMAILS=admin@onlineide.com
```

### Production Example
```bash
# Admin Settings - REQUIRED (comma-separated for multiple admins)  
# SECURITY: These emails will have admin access regardless of role in database
# CRITICAL: In production, use only verified corporate email addresses
# RECOMMENDATION: Limit to 2-3 trusted administrators maximum
ADMIN_EMAILS=admin@yourdomain.com,security@yourdomain.com
```

## Admin Management API

### Promote User to Admin
```http
POST /api/admin/users/{user_id}/promote
Authorization: Bearer <admin_token>
```

### Demote User from Admin
```http
POST /api/admin/users/{user_id}/demote
Authorization: Bearer <admin_token>
```

### Get All Admin Users
```http
GET /api/admin/users/admins
Authorization: Bearer <admin_token>
```

## Security Features

### 1. Admin Authorization Service
- **Centralized verification** via `AdminService`
- **Multiple verification methods** (role, superuser, environment)
- **Protected operations** with proper error handling

### 2. Secure Admin Management
- **Self-demotion prevention**: Admins cannot demote themselves
- **Environment admin protection**: Cannot demote initial admin emails
- **Role verification**: Only existing admins can promote/demote users

### 3. Frontend Security
- **API-based verification**: No hardcoded emails in frontend
- **Dynamic admin checks**: Real-time verification via backend
- **Secure error handling**: Graceful degradation on API failures

## Best Practices

### For Deployment

1. **Limit Admin Emails**
   - Use only 2-3 trusted administrators maximum
   - Use verified corporate email addresses
   - Avoid personal email addresses

2. **Regular Security Audits**
   ```bash
   GET /api/admin/users/admins  # Review all admin users
   ```

3. **Environment Security**
   - Store `ADMIN_EMAILS` in secure configuration management
   - Never commit actual admin emails to version control
   - Use different admin emails for different environments

### For Development

1. **Test Admin Functionality**
   ```bash
   # Test with development admin email
   ADMIN_EMAILS=admin@onlineide.com
   ```

2. **Database Migration**
   - The `role` column is added to users table
   - Existing users default to `USER` role
   - Environment-based admins get access automatically

## Migration from Old System

### Database Changes
```sql
-- Add role column to users table
ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user';

-- Update existing superusers to admin role
UPDATE users SET role = 'admin' WHERE is_superuser = true;
```

### Environment Updates
```bash
# Old format (deprecated)
ADMIN_EMAIL=admin@example.com

# New format (required)
ADMIN_EMAILS=admin@example.com,security@example.com
```

### Frontend Updates
- Removed hardcoded admin emails
- Added API-based admin verification
- Dynamic admin UI based on backend verification

## Security Considerations

### Environment-Based Admin Access
- **Pros**: Immediate admin access for initial setup
- **Cons**: Requires secure environment variable management
- **Recommendation**: Use for initial admins only, promote others via API

### Role-Based Admin Access
- **Pros**: Database-managed, auditable, revocable
- **Cons**: Requires existing admin to promote users
- **Recommendation**: Primary method for ongoing admin management

### Legacy Superuser Flag
- **Purpose**: Backward compatibility during migration
- **Recommendation**: Gradually migrate to role-based system

## Monitoring & Auditing

### Admin Activity Logs
- All admin operations are logged
- Track promotions/demotions
- Monitor admin access patterns

### Security Alerts
- Failed admin access attempts
- Unusual admin activity patterns
- Bulk user operations

## Troubleshooting

### Common Issues

1. **"Admin access required" Error**
   - Verify user email is in `ADMIN_EMAILS`
   - Check user role in database
   - Confirm `is_superuser` flag if using legacy system

2. **Cannot Promote User**
   - Ensure current user has admin access
   - Check target user exists and is active
   - Verify target user is not already admin

3. **Frontend Admin Menu Missing**
   - Check network connectivity to `/api/admin/stats`
   - Verify admin credentials are valid
   - Check browser console for API errors

### Support Contacts
- For security issues: Report to security team immediately
- For admin access: Contact system administrators
- For technical issues: Check application logs and error messages
