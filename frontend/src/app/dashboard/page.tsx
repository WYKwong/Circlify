'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';

interface Board { 
  boardId: string; 
  boardName: string; 
  ownerId: string; 
  enabledServices?: string[];
}

interface Membership {
  boardId: string;
  role: 'owner' | 'member' | 'manager';
  permissions?: string[];
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [requestModal, setRequestModal] = useState<{board: Board|null, question: string, answer: string, error: string, submitting:boolean}>({board:null, question:'', answer:'', error:'', submitting:false});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profileRes, boardsRes, memRes] = await Promise.all([
          axios.get('/api/profile'),
          axios.get('/api/boards'),
          axios.get('/api/boards/my-memberships-detailed').catch(()=>({data:{memberships:[]}})),
        ]);
        setProfile(profileRes.data);
        setBoards(boardsRes.data);
        setMemberships(memRes.data.memberships || []);
      } catch {
        // profile may fail if not logged in; boards still loaded via catch-all route
        try {
          const { data } = await axios.get('/api/boards');
          setBoards(data);
        } catch {}
      }
    };
    fetchData();
  }, []);

  const getMembershipForBoard = (boardId: string): Membership | undefined => {
    return memberships.find(m => m.boardId === boardId);
  };

  const joinDirect = async (b: Board) => {
    try {
      const res = await axios.post(`/api/boards/${b.boardId}/join`);
      if (res.data?.joined) {
        // Refresh memberships to update the UI
        const memRes = await axios.get('/api/boards/my-memberships-detailed');
        setMemberships(memRes.data.memberships || []);
      } else if (res.data?.requested) {
        alert('Join request submitted');
      } else if (res.data?.reason === 'ANSWER_REQUIRED') {
        setRequestModal({ board: b, answer: '', error: '', submitting: false });
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to join');
    }
  };

  const BoardGrid = ({ items }: { items: Board[] }) => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
      {items.map((b) => {
        const membership = getMembershipForBoard(b.boardId);
        const isOwner = membership?.role === 'owner';
        const isMember = membership && !isOwner;
        
        return (
          <div key={b.boardId} className="p-4 bg-white rounded shadow flex flex-col items-center">
            <span>{b.boardName}</span>
            {profile && (
              isOwner ? (
                <span className="mt-2 px-2 py-1 text-sm bg-green-500 text-white rounded">
                  Owner
                </span>
              ) : isMember ? (
                <button className="mt-2 px-2 py-1 text-sm bg-gray-400 text-white rounded" disabled>
                  Joined
                </button>
              ) : (
                <button
                  className="mt-2 px-2 py-1 text-sm bg-blue-500 text-white rounded"
                  onClick={async () => {
                    if (b.enabledServices?.includes('approveJoin')) {
                      try {
                        const { data } = await axios.get(`/api/boards/${b.boardId}/services/approveJoin`);
                        const question = data?.config?.askQuestion && data?.config?.questionText ? data.config.questionText : '';
                        if (question) {
                          setRequestModal({ board: b, question, answer: '', error: '', submitting: false });
                        } else {
                          joinDirect(b);
                        }
                      } catch {
                        // fallback to join
                        joinDirect(b);
                      }
                    } else {
                      joinDirect(b);
                    }
                  }}
                >
                  Join
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 dark:bg-neutral-900 p-4">
      {/* Header */}
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">All Boards</h1>
        <div className="flex items-center space-x-2">
          {profile ? (
            <>
              <span className="text-gray-800 dark:text-white">{profile.userName}</span>
              <Link
                className="px-3 py-1 bg-gray-600 text-white rounded"
                href="/account"
              >
                Account Center
              </Link>
              <button
                onClick={() => (window.location.href = '/api/logout')}
                className="px-3 py-1 bg-red-600 text-white rounded"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="px-3 py-1 bg-blue-600 text-white rounded"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Board section */}
      <section>
        <BoardGrid items={boards} />
      </section>

      {/* Join request modal */}
      {requestModal.board && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-xl">
             <h3 className="text-lg font-semibold mb-4">Join "{requestModal.board.boardName}"</h3>
             <p className="mb-2">{requestModal.question || 'Why do you want to join?'}</p>
            <textarea
              className="w-full border rounded px-2 py-1 h-24"
              value={requestModal.answer}
              onChange={e=>setRequestModal({...requestModal, answer:e.target.value})}
            />
            {requestModal.error && <p className="text-red-500 text-sm">{requestModal.error}</p>}
            <div className="flex justify-end space-x-2 pt-3">
              <button onClick={()=>setRequestModal({board:null,answer:'',error:'',submitting:false})} className="px-3 py-1 bg-gray-500 text-white rounded">Cancel</button>
              <button
                disabled={requestModal.submitting || (!!requestModal.question && !requestModal.answer.trim())}
                onClick={async ()=>{
                  if (!requestModal.board) return;
                  if (!!requestModal.question && !requestModal.answer.trim()) {
                    setRequestModal({...requestModal, error:'Answer required'});
                    return;
                  }
                  setRequestModal({...requestModal, submitting:true, error:''});
                  try {
                    await axios.post(`/api/boards/${requestModal.board.boardId}/request`, { answer: requestModal.answer });
                    alert('Request submitted');
                    setRequestModal({board:null,answer:'',error:'',submitting:false});
                  } catch (err:any) {
                    setRequestModal({...requestModal, submitting:false, error: err.response?.data?.message||'Failed'});
                  }
                }}
                className="px-3 py-1 bg-blue-600 text-white rounded"
              >
                {requestModal.submitting? 'Submitting...':'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
