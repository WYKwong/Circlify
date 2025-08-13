'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';

interface PermissionSelectorProps {
  boardId: string;
  userId: string;
  currentPermissions?: string[];
  onPermissionsUpdate: (permissions: string[]) => void;
  onClose: () => void;
}

export default function PermissionSelector({ 
  boardId, 
  userId, 
  currentPermissions = [], 
  onPermissionsUpdate, 
  onClose 
}: PermissionSelectorProps) {
  type PermissionKey = { serviceId: string; serviceType: string };
  const [availablePermissions, setAvailablePermissions] = useState<PermissionKey[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(currentPermissions);
  const [originalSelected, setOriginalSelected] = useState<string[]>(currentPermissions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Load board permissions (enabled services define available permission keys)
    const loadPermissions = async () => {
      try {
        const { data } = await axios.get(`/api/boards/${boardId}/permissions`);
        const perms: PermissionKey[] = (data.permissions || []) as PermissionKey[];
        setAvailablePermissions(perms);
        // For each available permission, get existing assignments and mark selected if this user has it
        const results = await Promise.all(
          perms.map(async (p) => {
            try {
              const { data: list } = await axios.get(`/api/boards/${boardId}/services/${p.serviceId}/permissions`);
              const has = (list || []).some((i: any) => i.userId === userId);
              return { key: p.serviceId, has };
            } catch { return { key: p.serviceId, has: false }; }
          })
        );
        const existing = results.filter(r => r.has).map(r => r.key);
        setSelectedPermissions(existing);
        setOriginalSelected(existing);
      } catch (err: any) {
        setError('Failed to load permissions');
      }
    };
    loadPermissions();
  }, [boardId]);

  const handlePermissionToggle = (permission: string) => {
    setSelectedPermissions(prev => 
      prev.includes(permission) 
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      const role = selectedPermissions.length > 0 ? 'manager' : 'member';
      await axios.put(`/api/boards/${boardId}/members/${userId}/role`, { role });
      // Sync service permissions (grant selected, revoke unselected) per key
      const toGrant = selectedPermissions.filter(k => !originalSelected.includes(k));
      const toRevoke = originalSelected.filter(k => !selectedPermissions.includes(k));
      await Promise.all([
        ...toGrant.map(key => axios.put(`/api/boards/${boardId}/services/${key}/permissions/${userId}`)),
        ...toRevoke.map(key => axios.delete(`/api/boards/${boardId}/services/${key}/permissions/${userId}`)),
      ]);
      onPermissionsUpdate(selectedPermissions);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update permissions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-96 max-h-96 overflow-y-auto shadow-xl">
        <h3 className="text-lg font-semibold mb-4">Manage Permissions</h3>
        
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Select permissions for this user. If no permissions are selected, the user will be a member.
          </p>
          
          {availablePermissions.map(p => (
            <div key={p.serviceId} className="flex items-center space-x-2">
              <input
                type="checkbox"
                id={p.serviceId}
                checked={selectedPermissions.includes(p.serviceId)}
                onChange={() => handlePermissionToggle(p.serviceId)}
                className="rounded"
              />
              <label htmlFor={p.serviceId} className="text-sm">
                {p.serviceType === 'approveJoin' ? 'Approve Join Requests' : `${p.serviceType} (${p.serviceId})`}
              </label>
            </div>
          ))}
        </div>

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        
        <div className="flex justify-end space-x-2 pt-4">
          <button
            onClick={onClose}
            className="px-3 py-1 bg-gray-500 text-white rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
