import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User, Camera, Lock, Shield, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL, API_ORIGIN } from '@/lib/api';
import axios from 'axios';

const Profile = () => {
  const { user, token, updateUser, refreshUser } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Profile form state
  const [profileData, setProfileData] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    email: user?.email || '',
  });

  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Profile picture preview
  const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (user) {
      setProfileData({
        full_name: user.full_name,
        phone: user.phone || '',
        email: user.email,
      });
      
      // Debug logging for auth_provider
      console.log('🔍 User auth_provider:', user.auth_provider, 'Type:', typeof user.auth_provider);
    }
  }, [user]);

  const handleProfileUpdate = async () => {
    try {
      setLoading(true);

      // Validate phone number format
      if (profileData.phone && !/^\+\d{10,15}$/.test(profileData.phone)) {
        toast({
          title: 'Invalid Phone Number',
          description: 'Phone number must include country code (e.g., +256700000000 for Uganda)',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      const response = await axios.put(
        `${API_BASE_URL}/auth/profile`,
        {
          full_name: profileData.full_name,
          phone: profileData.phone,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Update local user context
      if (updateUser) {
        updateUser({
          ...user!,
          full_name: response.data.user.full_name,
          phone: response.data.user.phone,
        });
      }

      toast({
        title: 'Success',
        description: 'Profile updated successfully',
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to update profile',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid File',
        description: 'Please select an image file',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: 'Image must be less than 5MB',
        variant: 'destructive',
      });
      return;
    }

    setSelectedFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setProfilePicturePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = async () => {
    if (!selectedFile) return;

    try {
      setUploadingImage(true);

      const formData = new FormData();
      formData.append('profilePicture', selectedFile);

      const response = await axios.post(
        `${API_BASE_URL}/auth/profile-picture`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      console.log('✅ Profile picture uploaded:', response.data.profile_picture);
      console.log('📁 Full image URL will be:', `${API_ORIGIN}${response.data.profile_picture}`);

      // Update local user context
      if (updateUser) {
        updateUser({
          ...user!,
          profile_picture: response.data.profile_picture,
        });
      }

      // Refresh user from context to ensure UI updates everywhere
      if (refreshUser) {
        refreshUser();
      }

      toast({
        title: 'Success',
        description: 'Profile picture updated successfully',
      });

      // Clear preview and selected file
      setProfilePicturePreview(null);
      setSelectedFile(null);
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload profile picture',
        variant: 'destructive',
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const handlePasswordChange = async () => {
    // Validation: new password and confirm are always required
    if (!passwordData.newPassword || !passwordData.confirmPassword) {
      toast({
        title: 'Validation Error',
        description: 'Please enter and confirm your new password',
        variant: 'destructive',
      });
      return;
    }

    if (!passwordData.currentPassword) {
      toast({
        title: 'Validation Error',
        description: 'Current password is required',
        variant: 'destructive',
      });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: 'Validation Error',
        description: 'New passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast({
        title: 'Validation Error',
        description: 'Password must be at least 6 characters long',
        variant: 'destructive',
      });
      return;
    }

    try {
      setChangingPassword(true);

      const payload = {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      };

      const response = await axios.post(
        `${API_BASE_URL}/auth/change-password`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast({
        title: 'Success',
        description: response.data.message || 'Password changed successfully',
      });

      // Clear form
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (error: unknown) {
      console.error('Error changing password:', error);
      const errorMessage = (error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to change password';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDateTime = (date: string | undefined) => {
    return date ? new Date(date).toLocaleString() : 'Never';
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'MANAGER':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'DESKTOP_AGENT':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  if (!user) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <AlertCircle className="h-16 w-16 text-red-500" />
          <p className="text-lg text-gray-600 dark:text-gray-400 ml-4">Please log in to view your profile</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <User className="h-8 w-8 text-blue-600" />
            My Profile
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your account settings and preferences
          </p>
        </div>

        {/* Must Change Password Alert */}
        {user.must_change_password && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You must change your password. Please update your password below using the temporary password provided.
            </AlertDescription>
          </Alert>
        )}

        {/* Profile Picture Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Profile Picture
            </CardTitle>
            <CardDescription>Update your profile picture</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
              <Avatar className="h-24 w-24 flex-shrink-0">
                <AvatarImage 
                  src={
                    profilePicturePreview || 
                    (user.profile_picture?.startsWith('http') 
                      ? user.profile_picture 
                      : user.profile_picture 
                        ? `${API_ORIGIN}${user.profile_picture}` 
                        : undefined)
                  } 
                />
                <AvatarFallback className="text-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                  {getInitials(user.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 w-full sm:w-auto space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageSelect}
                />
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="w-full sm:w-auto"
                  >
                    <Camera className="h-4 w-4 mr-2 flex-shrink-0" />
                    Choose Image
                  </Button>
                  {selectedFile && (
                    <Button onClick={handleImageUpload} disabled={uploadingImage} className="w-full sm:w-auto">
                      {uploadingImage ? 'Uploading...' : 'Upload'}
                    </Button>
                  )}
                  {profilePicturePreview && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setProfilePicturePreview(null);
                        setSelectedFile(null);
                      }}
                      className="w-full sm:w-auto"
                    >
                      Cancel
                    </Button>
                  )}
                </div>
                <p className="text-sm text-gray-500 break-words">
                  Recommended: Square image, at least 200x200px. Max size: 5MB
                </p>
                {selectedFile && (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{selectedFile.name} selected</span>
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Account Information
            </CardTitle>
            <CardDescription>View and update your personal information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={profileData.full_name}
                  onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                  placeholder="Enter your full name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={profileData.phone}
                  onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                  placeholder="+256700000000"
                />
                <p className="text-xs text-gray-500">Include country code (e.g., +256 for Uganda)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" value={profileData.email} disabled className="bg-gray-50 dark:bg-gray-900" />
                <p className="text-xs text-gray-500">Email cannot be changed</p>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <div className="flex items-center h-10">
                  <span className={`px-3 py-1 rounded text-sm font-medium ${getRoleBadgeColor(user.role)}`}>
                    {user.role}
                  </span>
                </div>
              </div>
            </div>
            <Separator />
            <div className="flex justify-end">
              <Button onClick={handleProfileUpdate} disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Account Details (Read-only) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Account Details
            </CardTitle>
            <CardDescription>View your account status and timestamps</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label className="text-gray-600 dark:text-gray-400">Account Status</Label>
                <div className="mt-2">
                  <span
                    className={`px-3 py-1 rounded text-sm font-medium ${
                      user.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {user.status}
                  </span>
                </div>
              </div>
              <div>
                <Label className="text-gray-600 dark:text-gray-400">Account Created</Label>
                <p className="mt-2 text-sm">{formatDateTime(user.created_at)}</p>
              </div>
              <div>
                <Label className="text-gray-600 dark:text-gray-400">Last Updated</Label>
                <p className="mt-2 text-sm">{formatDateTime(user.updated_at)}</p>
              </div>
              <div>
                <Label className="text-gray-600 dark:text-gray-400">Last Login</Label>
                <p className="mt-2 text-sm">{formatDateTime(user.last_login)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Change Password
            </CardTitle>
            <CardDescription>
              Update your password to keep your account secure
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  placeholder="Enter current password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  placeholder="Enter new password (min 6 characters)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  placeholder="Confirm new password"
                />
              </div>
            </div>
            <Separator />
            <div className="flex justify-end">
              <Button onClick={handlePasswordChange} disabled={changingPassword}>
                {changingPassword ? 'Changing Password...' : 'Change Password'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default Profile;
