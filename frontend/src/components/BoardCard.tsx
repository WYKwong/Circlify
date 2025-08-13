'use client';
import { useState } from 'react';
import axios from 'axios';
import PermissionSelector from './PermissionSelector';

interface Board {
  boardId: string;
  boardName: string;
  ownerId: string;
  requestTtlDays?: number;
  enabledServices?: string[];
  role?: 'owner' | 'manager' | 'member';
}

interface JoinRequest {
  userId: string;
  answer?: string;
}

interface Member {
  userId: string;
  role: 'owner' | 'member' | 'manager';
  permissions?: string[];
  userName?: string;
}

interface BoardCardProps {
  board: Board;
  onBoardUpdate?: (updatedBoard: Board) => void;
}

export default function BoardCard({ board, onBoardUpdate }: BoardCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [searchUsername, setSearchUsername] = useState('');
  const [managers, setManagers] = useState<Member[]>([]);
  const [searchResult, setSearchResult] = useState<any>(null);

  // Board settings editing state
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    boardName: board.boardName,
  });
  const [settingsError, setSettingsError] = useState('');
  const [updatingSettings, setUpdatingSettings] = useState(false);
  // Service settings state
  const [availableServices, setAvailableServices] = useState<any[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>(board.enabledServices || []);
  const [serviceConfigs, setServiceConfigs] = useState<Record<string, any>>({});
  const [confirmDisable, setConfirmDisable] = useState<{open:boolean, input:string, services:string[]}>({ open: false, input: '', services: [] });
  
  // Permission management state
  const [showPermissionSelector, setShowPermissionSelector] = useState(false);
  const [selectedUserForPermissions, setSelectedUserForPermissions] = useState<Member | null>(null);

  const updateMemberRole = async (userId: string, role: 'member'|'manager') => {
    try {
      await axios.put(`/api/boards/${board.boardId}/members/${userId}/role`, { role });
      // Refresh managers list for this specific board
      const { data } = await axios.get(`/api/boards/${board.boardId}/members/manager`);
      setManagers(data.members);
    } catch (err: any) {
      console.error('Failed to update role:', err);
    }
  };

  const loadManagers = async () => {
    try {
      const { data } = await axios.get(`/api/boards/${board.boardId}/members/manager`);
      setManagers(data.members);
    } catch (err: any) {
      console.error('Failed to load managers:', err);
    }
  };

  const searchMember = async (username: string) => {
    try {
      const { data } = await axios.get(`/api/boards/${board.boardId}/members/search/${username}`);
      if (data.found) {
        setSearchResult(data.member);
      } else {
        setSearchResult(null);
      }
    } catch (err: any) {
      setSearchResult(null);
    }
  };

  // Permission check functions
  const hasPermission = (permission: string): boolean => {
    if (board.role === 'owner') return true;
    // For manager/member, UI should consult backend when needed
    return false;
  };

  const canApproveJoinRequests = (): boolean => {
    return hasPermission('approveJoin');
  };

  const updateBoardSettings = async () => {
    const nameTrim = settingsForm.boardName.trim();
    if (!nameTrim) return;
    
    setUpdatingSettings(true);
    setSettingsError('');
    try {
        const { data } = await axios.put(`/api/boards/${board.boardId}`, {
          boardName: nameTrim,
        });
      
      // Update the board in parent component
      if (onBoardUpdate) {
        onBoardUpdate({ ...board, ...data });
      }
      
      setEditingSettings(false);
    } catch (err: any) {
      setSettingsError(err.response?.data?.message || 'Failed to update board settings');
    } finally {
      setUpdatingSettings(false);
    }
  };

  // Board Requests Component (inline)
  const BoardRequests = () => {
    const [requests, setRequests] = useState<JoinRequest[] | null>(null);
    const [error, setError] = useState('');

    const fetch = async () => {
      try {
        const { data } = await axios.get(`/api/boards/${board.boardId}/requests`);
        setRequests(data);
      } catch (e: any) {
        setError(e.response?.data?.message || 'Failed to load');
      }
    };

    const handle = async (userId: string, action: 'approve' | 'reject') => {
      try {
        await axios.post(`/api/boards/${board.boardId}/requests/${userId}/${action}`);
        fetch(); // Refresh
      } catch (e: any) {
        setError(e.response?.data?.message || `Failed to ${action}`);
      }
    };

    if (requests === null) {
      return (
        <div className="mt-2">
          <button onClick={fetch} className="text-xs text-blue-600 underline">
            Load Requests
          </button>
          {error && <p className="text-red-500 text-xs">{error}</p>}
        </div>
      );
    }

    return (
      <ul className="mt-2 space-y-1">
        {requests.map((r) => (
          <li key={r.userId} className="text-xs p-2 bg-gray-50 rounded">
            <div>Applicant: {r.userId}</div>
            {r.answer && <div>Answer: {r.answer}</div>}
            <div className="mt-1 space-x-1">
              <button onClick={() => handle(r.userId, 'approve')} className="px-2 py-1 text-sm bg-green-600 text-white rounded">Approve</button>
              <button onClick={() => handle(r.userId, 'reject')} className="px-2 py-1 text-sm bg-red-600 text-white rounded">Reject</button>
            </div>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 w-64 h-64 flex flex-col border-2 border-black">
      {/* Board Header */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-lg truncate">{board.boardName}</h3>
        <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
          {board.role || 'member'}
        </span>
      </div>

      {/* Board Info */}
      <div className="flex-1 overflow-y-auto">
        {board.enabledServices?.includes('approveJoin') && (
          <p className="text-xs text-blue-600 mb-2">Approval required</p>
        )}
        
        {/* Owner Features */}
        {(board.role === 'owner') && (
          <div className="space-y-3">
            {/* Board Settings Button */}
            <div>
              <button
                onClick={async ()=>{
                  setEditingSettings(true);
                  setSettingsError('');
                  setUpdatingSettings(false);
                  try {
                    const [svcRes, cfgRes] = await Promise.all([
                      axios.get('/api/services'),
                      axios.get(`/api/boards/${board.boardId}/services`).catch(()=>({data:[]})),
                    ]);
                    setAvailableServices(svcRes.data || []);
                    setSelectedServices(board.enabledServices || []);
                    const cfgMap: Record<string, any> = {};
                    (cfgRes.data || []).forEach((i: any)=>{ cfgMap[i.serviceType] = i.config; });
                    setServiceConfigs(cfgMap);
                  } catch (e:any) {
                    setSettingsError(e.response?.data?.message||'Failed to load services');
                  }
                }}
                className="px-2 py-1 text-xs bg-purple-600 text-white rounded"
              >
                Edit Settings
              </button>
            </div>

            {/* Member Management */}
            <div>
              <label className="block text-xs font-medium mb-1">Search Member</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Username"
                  value={searchUsername}
                  onChange={(e) => setSearchUsername(e.target.value)}
                  className="flex-1 text-xs border rounded px-2 py-1"
                />
                <button
                  onClick={() => searchMember(searchUsername)}
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
                >
                  Search
                </button>
              </div>
              
              {/* Search Result */}
              {searchResult && (
                <div className="mt-2 p-2 bg-gray-50 rounded">
                  <p className="text-xs">Found: {searchResult.userName} (Role: {searchResult.role})</p>
                  {searchResult.role === 'member' && (
                    <button
                      onClick={() => {
                        setSelectedUserForPermissions({
                          userId: searchResult.userId,
                          role: 'manager',
                          userName: searchResult.userName
                        });
                        setShowPermissionSelector(true);
                      }}
                      className="mt-1 px-2 py-1 text-xs bg-green-600 text-white rounded"
                    >
                      Make Manager
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Managers List */}
            <div>
              <label className="block text-xs font-medium mb-1">Managers</label>
              <button
                onClick={() => loadManagers()}
                className="text-xs text-blue-600 underline"
              >
                Load Managers
              </button>
              {managers.length > 0 && (
                <div className="mt-1 space-y-1">
                  {managers.map((manager) => (
                    <div key={manager.userId} className="flex justify-between items-center p-1 bg-gray-50 rounded">
                      <span className="text-xs">{manager.userName || manager.userId}</span>
                      <div className="flex space-x-1">
                        <button
                          onClick={() => {
                            setSelectedUserForPermissions(manager);
                            setShowPermissionSelector(true);
                          }}
                          className="px-1 py-0.5 text-xs bg-blue-600 text-white rounded"
                        >
                          Permissions
                        </button>
                        <button
                          onClick={() => updateMemberRole(manager.userId, 'member')}
                          className="px-1 py-0.5 text-xs bg-red-600 text-white rounded"
                        >
                          Demote
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Join Requests */}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-blue-600">Join Requests</summary>
              <BoardRequests />
            </details>
          </div>
        )}

        {/* Manager Features (based on per-service permissions) */}
        {(board.role === 'manager') && (
          <ManagerFeatures boardId={board.boardId} enabledServices={board.enabledServices || []} />
        )}


      </div>

      {/* Settings Edit Modal */}
      {editingSettings && (
        <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 max-h-96 overflow-y-auto shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Edit Board Settings</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium">Board name</label>
                <input 
                  value={settingsForm.boardName} 
                  onChange={e => setSettingsForm({...settingsForm, boardName: e.target.value})} 
                  className="w-full border px-2 py-1 rounded"
                />
              </div>
              {/* Services toggle & per-service config */}
              <div>
                <label className="block text-sm font-medium mb-1">Services</label>
                <div className="space-y-2">
                  {availableServices.map((s:any)=>(
                    <div key={s.serviceType} className="border rounded p-2">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={selectedServices.includes(s.serviceType)}
                          onChange={(e)=>{
                            const checked = e.target.checked;
                            setSelectedServices(prev=>checked? Array.from(new Set([...prev, s.serviceType])) : prev.filter(k=>k!==s.serviceType));
                          }}
                        />
                        <div>
                          <div className="font-medium text-sm">{s.displayName || s.serviceType}</div>
                          <div className="text-xs text-gray-600">{s.description}</div>
                        </div>
                      </div>
                      {s.serviceType==='approveJoin' && selectedServices.includes('approveJoin') && (
                        <div className="mt-2 ml-6 space-y-2">
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={!!(serviceConfigs['approveJoin']?.askQuestion)}
                              onChange={(e)=> setServiceConfigs(prev=>({
                                ...prev,
                                approveJoin: { ...(prev.approveJoin||{}), askQuestion: e.target.checked }
                              }))}
                            />
                            <label className="text-sm">Ask join question</label>
                          </div>
                          {serviceConfigs['approveJoin']?.askQuestion && (
                            <input
                              placeholder="Question text"
                              value={serviceConfigs['approveJoin']?.questionText||''}
                              onChange={(e)=> setServiceConfigs(prev=>({
                                ...prev,
                                approveJoin: { ...(prev.approveJoin||{}), questionText: e.target.value }
                              }))}
                              className="w-full border px-2 py-1 rounded"
                            />
                          )}
                          <div>
                            <label className="block text-sm font-medium">Request TTL (1-5 days)</label>
                            <input
                              type="number"
                              min={1}
                              max={5}
                              value={serviceConfigs['approveJoin']?.ttlDays ?? 1}
                              onChange={(e)=> setServiceConfigs(prev=>({
                                ...prev,
                                approveJoin: { ...(prev.approveJoin||{}), ttlDays: parseInt(e.target.value,10) }
                              }))}
                              className="border px-2 py-1 rounded w-20"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {settingsError && <p className="text-red-500">{settingsError}</p>}
              <div className="flex justify-end space-x-2 pt-2">
                <button 
                  onClick={() => setEditingSettings(false)} 
                  className="px-3 py-1 bg-gray-500 text-white rounded"
                >
                  Cancel
                </button>
                <button 
                  disabled={updatingSettings || !settingsForm.boardName.trim()} 
                  onClick={async ()=>{
                    if (settingsForm.boardName.trim() !== board.boardName) {
                      await updateBoardSettings();
                    }
                    // Save services
                    setUpdatingSettings(true);
                    try {
                      const prev = new Set(board.enabledServices || []);
                      const next = new Set(selectedServices);
                      const toEnable = Array.from(next).filter(k=>!prev.has(k));
                      const toDisable = Array.from(prev).filter(k=>!next.has(k));

                      if (toDisable.length > 0) {
                        setConfirmDisable({open:true, input:'', services: toDisable});
                        setUpdatingSettings(false);
                        return;
                      }
                      for (const key of Array.from(next)) {
                        await axios.put(`/api/boards/${board.boardId}/services/${key}`, { config: serviceConfigs[key] || {} });
                      }
                      if (onBoardUpdate) onBoardUpdate({...board, enabledServices: Array.from(next)});
                      setEditingSettings(false);
                    } catch (e:any) {
                      setSettingsError(e.response?.data?.message||'Failed to save');
                    } finally {
                      setUpdatingSettings(false);
                    }
                  }} 
                  className="px-3 py-1 bg-blue-600 text-white rounded"
                >
                  {updatingSettings ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDisable.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96">
            <h3 className="text-lg font-semibold mb-3">Confirm disable</h3>
            <p className="text-sm mb-2">Disabling the selected services will delete their settings and related data.</p>
            <ul className="list-disc list-inside text-sm mb-2">
              {confirmDisable.services.map(s=> (<li key={s}>{s}</li>))}
            </ul>
            <p className="text-sm">Type the board name <span className="font-semibold">{board.boardName}</span> to confirm:</p>
            <input className="w-full border px-2 py-1 rounded mt-2" value={confirmDisable.input} onChange={(e)=>setConfirmDisable({...confirmDisable, input: e.target.value})} />
            <div className="flex justify-end space-x-2 pt-3">
              <button onClick={()=>setConfirmDisable({open:false, input:'', services:[]})} className="px-3 py-1 bg-gray-500 text-white rounded">Cancel</button>
              <button onClick={async ()=>{
                if (confirmDisable.input.trim() !== board.boardName.trim()) {
                  setSettingsError('Board name does not match');
                  return;
                }
                setUpdatingSettings(true);
                try {
                  for (const key of confirmDisable.services) {
                    await axios.delete(`/api/boards/${board.boardId}/services/${key}`);
                  }
                  const next = (selectedServices || []).filter(k=>!confirmDisable.services.includes(k));
                  setSelectedServices(next);
                  if (onBoardUpdate) onBoardUpdate({...board, enabledServices: next});
                  setConfirmDisable({open:false, input:'', services:[]});
                  setEditingSettings(false);
                } catch (e:any) {
                  setSettingsError(e.response?.data?.message||'Failed to disable services');
                } finally {
                  setUpdatingSettings(false);
                }
              }} className="px-3 py-1 bg-red-600 text-white rounded">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Permission Selector Modal */}
      {showPermissionSelector && selectedUserForPermissions && (
        <PermissionSelector
          boardId={board.boardId}
          userId={selectedUserForPermissions.userId}
          currentPermissions={selectedUserForPermissions.permissions}
          onPermissionsUpdate={(permissions) => {
            // Refresh managers list after permission update
            loadManagers();
            setShowPermissionSelector(false);
            setSelectedUserForPermissions(null);
          }}
          onClose={() => {
            setShowPermissionSelector(false);
            setSelectedUserForPermissions(null);
          }}
        />
      )}
    </div>
  );
}

function ManagerFeatures({ boardId, enabledServices }: { boardId: string; enabledServices: string[] }) {
  const [canApprove, setCanApprove] = useState<boolean>(false);

  useEffect(() => {
    const check = async () => {
      if (!enabledServices.includes('approveJoin')) {
        setCanApprove(false);
        return;
      }
      try {
        const { data } = await axios.get(`/api/boards/${boardId}/services/approveJoin/permissions/me`);
        setCanApprove(!!data?.has);
      } catch {
        setCanApprove(false);
      }
    };
    check();
  }, [boardId, enabledServices]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-600">You are a manager of this board</p>
      <div className="text-xs">
        <span className="font-medium">Board Type:</span> {enabledServices.includes('approveJoin') ? 'Approval Required' : 'Open Join'}
      </div>
      {canApprove && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-blue-600">Join Requests</summary>
          {/* Inline reuse from parent component is not trivial; simplest approach is to duplicate or factor out. Here keep simple info. */}
          <p className="text-xs text-gray-600">Open Account Center to manage requests.</p>
        </details>
      )}
    </div>
  );
}
