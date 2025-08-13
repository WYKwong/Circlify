'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import BoardCard from '../../components/BoardCard';

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



export default function AccountCenterPage() {
  const [profile, setProfile] = useState<any>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameErr, setRenameErr] = useState('');

  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    boardName: '',
    enabledServices: [] as string[],
    joinQuestion: '',
    requestTtlDays: 1,
  });
  const [availableServices, setAvailableServices] = useState<any[]>([]);



  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profileRes, boardsRes, membershipsRes, servicesRes] = await Promise.all([
          axios.get('/api/profile'),
          axios.get('/api/boards/my'),
          axios.get('/api/boards/my-memberships-detailed'),
          axios.get('/api/services').catch(()=>({data:[]})),
        ]);
        setProfile(profileRes.data);
        setNewName(profileRes.data?.userName || '');
        
        // Merge board data with membership roles
        const boardsWithRoles = boardsRes.data.map((board: Board) => {
          const membership = membershipsRes.data.memberships?.find((m: any) => m.boardId === board.boardId);
          return {
            ...board,
            role: board.ownerId === profileRes.data?.userId ? 'owner' : 
                  membership ? membership.role : undefined
          };
        });
        setBoards(boardsWithRoles);
        setAvailableServices(servicesRes.data || []);
      } catch {}
    };
    fetchData();
  }, []);

  // ---------- actions ----------
  const saveUserName = async () => {
    setRenameErr('');
    try {
      await axios.post('/api/profile/username', { userName: newName });
      setProfile({ ...profile, userName: newName });
      setEditing(false);
    } catch (err: any) {
      setRenameErr(err.response?.data?.message || 'Failed to update');
    }
  };

  const submitBoard = async () => {
    const nameTrim = form.boardName.trim();
    if (!nameTrim) return;
    if (boards.find(b => b.boardName.toLowerCase() === nameTrim.toLowerCase())) {
      setCreateErr('Board name already exists');
      return;
    }
    setCreating(true);
    setCreateErr('');
    try {
      const enabledServices = form.enabledServices;
      const serviceSettings: any = {};
      if (enabledServices.includes('approveJoin')) {
        serviceSettings.approveJoin = {
          ttlDays: form.requestTtlDays,
          askQuestion: !!form.joinQuestion,
          questionText: form.joinQuestion || ''
        };
      }
      const { data } = await axios.post('/api/boards', {
        boardName: form.boardName.trim(),
        enabledServices,
        serviceSettings,
      });
      setBoards([...boards, data]);
    } catch (err: any) {
      setCreateErr(err.response?.data?.message || 'Unable to create board');
    } finally {
      setCreating(false);
      setShowModal(false);
      setForm({ boardName:'', enabledServices:[], joinQuestion:'', requestTtlDays:1 });
    }
  };





  // ---------- components ----------
  const BoardRequests = ({ board }: { board: Board }) => {
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

    useEffect(() => {
      fetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (error) return <p className="text-red-500">{error}</p>;
    if (!requests) return <p>Loading...</p>;
    if (requests.length === 0) return <p className="text-sm text-gray-500">No pending requests</p>;

    const handle = async (uid: string, action: 'approve' | 'reject') => {
      try {
        await axios.post(`/api/boards/${board.boardId}/requests/${uid}/${action}`);
        setRequests(requests.filter(r => r.userId !== uid));
      } catch {}
    };

    return (
      <ul className="mt-2 space-y-2">
        {requests.map(r => (
          <li key={r.userId} className="border p-2 rounded-md flex justify-between items-center">
            <div>
              <p className="font-medium">{r.userId}</p>
              {r.answer && <p className="text-sm text-gray-700">Answer: {r.answer}</p>}
            </div>
            <div className="space-x-2">
              <button onClick={() => handle(r.userId, 'approve')} className="px-2 py-1 text-sm bg-green-600 text-white rounded">Approve</button>
              <button onClick={() => handle(r.userId, 'reject')} className="px-2 py-1 text-sm bg-red-600 text-white rounded">Reject</button>
            </div>
          </li>
        ))}
      </ul>
    );
  };



  const handleBoardUpdate = (updatedBoard: Board) => {
    setBoards(boards.map(b => b.boardId === updatedBoard.boardId ? updatedBoard : b));
  };

  const BoardGrid = ({ items }: { items: Board[] }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 mt-4 justify-items-center">
      {items.map((board) => (
        <BoardCard 
          key={board.boardId} 
          board={board} 
          onBoardUpdate={handleBoardUpdate}
        />
      ))}
    </div>
  );

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-neutral-900 p-4">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Account Center</h1>
        <div className="flex items-center space-x-2">
          <Link className="px-3 py-1 bg-gray-600 text-white rounded" href="/dashboard">
            Back to Dashboard
          </Link>
          <button onClick={() => (window.location.href = '/api/logout')} className="px-3 py-1 bg-red-600 text-white rounded">
            Logout
          </button>
        </div>
      </header>

      {/* Rename */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Change Username</h2>
        {editing ? (
          <div className="space-y-2">
            <input className="px-3 py-2 border rounded-md" value={newName} onChange={(e) => setNewName(e.target.value.trim())} />
            {renameErr && <p className="text-red-500">{renameErr}</p>}
            <div className="space-x-2">
              <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={saveUserName}>Save</button>
              <button className="px-4 py-2 bg-gray-500 text-white rounded" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={() => setEditing(true)}>
            Edit Username
          </button>
        )}
      </section>

      {/* Boards */}
      <section>
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">My Boards</h2>
          <button onClick={()=>setShowModal(true)} className="px-3 py-1 bg-blue-600 text-white rounded">
            Create Board
          </button>
        </div>
        {createErr && <p className='text-red-500 mt-1'>{createErr}</p>}

{showModal && (
  <div className='bg-white p-6 rounded-lg w-96 my-4 shadow-xl'>
      <h3 className='text-lg font-semibold mb-4'>Create Board</h3>
      <div className='space-y-3'>
        <div>
          <label className='block text-sm font-medium'>Board name</label>
          <input value={form.boardName} onChange={e=>setForm({...form, boardName:e.target.value})} className='w-full border px-2 py-1 rounded'/>
        </div>
        {/* Approval is now a service choice (approveJoin) */}
        {/* Available Services Selection */}
        <div>
          <label className='block text-sm font-medium mb-1'>Enable services</label>
          <div className='space-y-2'>
            {availableServices.map(s => (
              <div key={s.serviceType} className='border rounded p-2'>
                <div className='flex items-center space-x-2'>
                  <input
                    type='checkbox'
                    checked={form.enabledServices.includes(s.serviceType)}
                    onChange={e => {
                      const checked = e.target.checked;
                      setForm(prev => ({
                        ...prev,
                        enabledServices: checked
                          ? Array.from(new Set([...(prev.enabledServices||[]), s.serviceType]))
                          : (prev.enabledServices||[]).filter((id: string) => id !== s.serviceType)
                      }));
                    }}
                  />
                  <div>
                    <div className='font-medium text-sm'>{s.displayName || s.serviceType}</div>
                    <div className='text-xs text-gray-600'>{s.description}</div>
                  </div>
                </div>

                {/* approveJoin additional settings */}
                {s.serviceType === 'approveJoin' && form.enabledServices.includes('approveJoin') && (
                  <div className='mt-2 ml-6 space-y-2'>
                    <div className='flex items-center space-x-2'>
                      <input
                        type='checkbox'
                        checked={!!form.joinQuestion}
                        onChange={e => setForm(prev => ({...prev, joinQuestion: e.target.checked ? (prev.joinQuestion || 'Why do you want to join?') : ''}))}
                      />
                      <label className='text-sm'>Set application question</label>
                    </div>
                    {!!form.joinQuestion && (
                      <input
                        value={form.joinQuestion}
                        onChange={e=>setForm({...form, joinQuestion:e.target.value})}
                        placeholder='Enter the question to ask applicants'
                        className='w-full border px-2 py-1 rounded'
                      />
                    )}
                    <div>
                      <label className='block text-sm font-medium'>Request TTL (1-5 days)</label>
                      <input type='number' min={1} max={5} value={form.requestTtlDays} onChange={e=>setForm({...form, requestTtlDays: parseInt(e.target.value,10)})} className='border px-2 py-1 rounded w-20'/>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {createErr && <p className='text-red-500'>{createErr}</p>}
        <div className='flex justify-end space-x-2 pt-2'>
          <button onClick={()=>setShowModal(false)} className='px-3 py-1 bg-gray-500 text-white rounded'>Cancel</button>
          <button disabled={creating || !form.boardName.trim()} onClick={submitBoard} className='px-3 py-1 bg-blue-600 text-white rounded'>
            {creating? 'Creating...':'Create'}
          </button>
        </div>
      </div>
    </div>
)}
        <BoardGrid items={boards} />
      </section>
    </div>
  );
}
