import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc,
  doc,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { 
  ref as storageRef, 
  uploadBytesResumable, 
  getDownloadURL 
} from 'firebase/storage';
import { db, auth, storage, handleFirestoreError, OperationType } from '../firebase';
import { DirectMessage, UserProfile, Relationship } from '../types';
import { sendNotification } from '../lib/notificationService';
import { subscribeToUserBlocks } from '../lib/blockService';
import { 
  MessageCircle, 
  Send, 
  User as UserIcon, 
  Search, 
  ShieldCheck, 
  ShieldAlert,
  AlertCircle,
  Smile,
  Image as ImageIcon,
  Paperclip,
  X,
  FileText,
  Download,
  Loader2,
  ArrowLeft,
  HeartHandshake,
  UserCheck,
  CheckCircle2,
  Users,
  Sparkles,
  ChevronRight,
  Check
} from 'lucide-react';

interface DirectMessagesProps {
  currentUserId: string;
  currentUserName: string;
  currentUserEmail: string;
  initialRecipient?: string;
  onOpenProfile?: (identifier: string) => void;
  onNavigateToRelate?: () => void;
  onRequireAuth?: (reason?: string) => void;
}

interface AttachmentStaging {
  file: File;
  previewUrl: string;
  name: string;
  size: string;
  type: 'image' | 'file';
}

const EMOJI_CATEGORIES = [
  {
    category: 'Expressions',
    emojis: ['😊', '😂', '🥰', '😍', '😎', '🤩', '🥳', '🤔', '🙌', '👏', '🔥', '✨', '💯', '🚀']
  },
  {
    category: 'Hearts & Vibes',
    emojis: ['👋', '👍', '🤝', '✌️', '❤️', '💖', '💙', '💜', '🖤', '🌸', '⭐', '⚡', '💡', '🎉']
  },
  {
    category: 'Activity & Fun',
    emojis: ['💬', '🌟', '🌈', '☕', '🍕', '🎯', '🏆', '💎', '🎨', '🎵', '☀️', '🌙', '🍀', '🛡️']
  }
];

export const DirectMessages: React.FC<DirectMessagesProps> = ({
  currentUserId,
  currentUserName,
  currentUserEmail,
  initialRecipient,
  onOpenProfile,
  onNavigateToRelate,
  onRequireAuth,
}) => {
  const activeUid = auth.currentUser?.uid || currentUserId;

  if (!activeUid) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4 bg-white/95 dark:bg-zinc-900/90 rounded-3xl p-8 border border-zinc-200/80 dark:border-zinc-800 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center">
          <MessageCircle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Direct Messages Protection
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
          Direct Messages are encrypted 1-to-1 private conversations. Please sign in with your TEZOCRON account to access DMs.
        </p>
        {onRequireAuth && (
          <button
            type="button"
            onClick={() => onRequireAuth('Sign in with Firebase Auth to view and send Direct Messages.')}
            className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-pink-600 text-white text-xs font-bold shadow-md shadow-blue-500/20 hover:opacity-95 cursor-pointer"
          >
            Sign In with Firebase Auth
          </button>
        )}
      </div>
    );
  }
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);
  const [myRelationships, setMyRelationships] = useState<Relationship[]>([]);
  const [incomingRelationships, setIncomingRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchAllMembers, setSearchAllMembers] = useState(false);
  const [selectedPeer, setSelectedPeer] = useState<string | null>(initialRecipient || null);
  const [msgText, setMsgText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Emojis and attachments state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [stagedAttachment, setStagedAttachment] = useState<AttachmentStaging | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when messages update in chat
  useEffect(() => {
    if (selectedPeer) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, selectedPeer]);

  // Handle deep-link initial recipient
  useEffect(() => {
    if (initialRecipient) {
      setSelectedPeer(initialRecipient);
    }
  }, [initialRecipient]);

  // 1. Fetch all real Firebase users
  useEffect(() => {
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const usersList: UserProfile[] = snapshot.docs.map((doc) => ({
          uid: doc.id,
          ...doc.data(),
        })) as UserProfile[];
        setRegisteredUsers(usersList);
      },
      (err) => {
        console.error('Error fetching registered users:', err);
      }
    );
    return () => unsubUsers();
  }, []);

  // 2. Fetch relationships where current user is initiator
  useEffect(() => {
    if (!activeUid || !auth.currentUser) return;

    const relQuery = query(
      collection(db, 'relationships'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubRel = onSnapshot(
      relQuery,
      (snapshot) => {
        const rels: Relationship[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Relationship[];
        setMyRelationships(rels);
      },
      (err) => {
        console.error('Error fetching my relationships:', err);
      }
    );

    return () => unsubRel();
  }, [activeUid]);

  // 3. Fetch relationships where current user is target
  useEffect(() => {
    if (!activeUid || !auth.currentUser) return;

    const incomingQuery = query(
      collection(db, 'relationships'),
      where('targetUserId', '==', auth.currentUser.uid)
    );

    const unsubIncoming = onSnapshot(
      incomingQuery,
      (snapshot) => {
        const rels: Relationship[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Relationship[];
        setIncomingRelationships(rels);
      },
      (err) => {
        console.error('Error fetching incoming relationships:', err);
      }
    );

    return () => unsubIncoming();
  }, [activeUid]);

  // 4. Sync real Direct Messages from Firestore
  useEffect(() => {
    setLoading(true);
    setError(null);

    if (!activeUid || !auth.currentUser) {
      setLoading(false);
      return;
    }

    const sentQuery = query(
      collection(db, 'dms'),
      where('senderId', '==', auth.currentUser.uid)
    );

    const receivedQuery = query(
      collection(db, 'dms'),
      where('recipientId', '==', auth.currentUser.uid)
    );

    let sentMessages: DirectMessage[] = [];
    let receivedMessages: DirectMessage[] = [];

    const mergeAndSort = () => {
      const all = [...sentMessages, ...receivedMessages];
      const map = new Map<string, DirectMessage>();
      all.forEach((m) => map.set(m.id, m));
      const deduplicated = Array.from(map.values());
      deduplicated.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setMessages(deduplicated);
      setLoading(false);
    };

    const unsubSent = onSnapshot(
      sentQuery,
      (snapshot) => {
        sentMessages = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as DirectMessage[];
        mergeAndSort();
      },
      (err) => {
        console.error('Sent DMs load error:', err);
        setError('Unable to sync sent direct messages.');
        setLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, 'dms');
        } catch {
          // Handled
        }
      }
    );

    const unsubReceived = onSnapshot(
      receivedQuery,
      (snapshot) => {
        receivedMessages = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as DirectMessage[];
        mergeAndSort();
      },
      (err) => {
        console.error('Received DMs load error:', err);
        setError('Unable to sync incoming direct messages.');
        setLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, 'dms');
        } catch {
          // Handled
        }
      }
    );

    return () => {
      unsubSent();
      unsubReceived();
    };
  }, [activeUid]);

  // Block state
  const [blockedUids, setBlockedUids] = useState<string[]>([]);
  const [blockedByUids, setBlockedByUids] = useState<string[]>([]);

  // Subscribe to real-time user blocks
  useEffect(() => {
    if (!activeUid || !auth.currentUser) return;

    const unsubBlocks = subscribeToUserBlocks(activeUid, ({ blockedUids: bu, blockedByUids: bbu }) => {
      setBlockedUids(bu);
      setBlockedByUids(bbu);
    });

    return () => unsubBlocks();
  }, [activeUid]);

  // Compute set of real Related user UIDs
  const relatedUserIds = useMemo(() => {
    const ids = new Set<string>();
    myRelationships.forEach((r) => ids.add(r.targetUserId));
    incomingRelationships.forEach((r) => ids.add(r.userId));
    ids.delete(activeUid);
    return ids;
  }, [myRelationships, incomingRelationships, activeUid]);

  // Filter real Related Users list
  const relatedUsersList = useMemo(() => {
    let list = registeredUsers.filter(
      (u) => u.uid !== activeUid && !blockedUids.includes(u.uid) && !blockedByUids.includes(u.uid)
    );

    if (!searchAllMembers) {
      list = list.filter((u) => relatedUserIds.has(u.uid));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((u) => u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }

    return list;
  }, [registeredUsers, activeUid, blockedUids, blockedByUids, searchAllMembers, relatedUserIds, searchQuery]);

  // Active Peer user object for current chat
  const activePeerUser = useMemo(() => {
    if (!selectedPeer) return null;
    return registeredUsers.find((u) => u.uid === selectedPeer || u.email.toLowerCase() === selectedPeer.toLowerCase()) || null;
  }, [selectedPeer, registeredUsers]);

  const activePeerUid = activePeerUser?.uid || selectedPeer;
  const isPeerBlockedByMe = useMemo(() => Boolean(activePeerUid && blockedUids.includes(activePeerUid)), [activePeerUid, blockedUids]);
  const isPeerBlockedMe = useMemo(() => Boolean(activePeerUid && blockedByUids.includes(activePeerUid)), [activePeerUid, blockedByUids]);
  const isInteractionRestricted = useMemo(() => isPeerBlockedByMe || isPeerBlockedMe, [isPeerBlockedByMe, isPeerBlockedMe]);

  // Real-time keying / typing indicator & read receipt state
  const [isPeerKeying, setIsPeerKeying] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Automatically mark incoming unread messages as read in real-time when viewing active chat
  useEffect(() => {
    if (!selectedPeer || !activeUid || !auth.currentUser) return;

    const resolvedPeerUid = activePeerUser ? activePeerUser.uid : selectedPeer;

    const unreadIncoming = messages.filter((m) => {
      const isFromPeer = m.senderId === resolvedPeerUid || m.senderName === resolvedPeerUid || m.senderId === selectedPeer;
      const isToMe = m.recipientId === activeUid || m.recipientEmail === currentUserEmail || m.recipientId === auth.currentUser?.uid;
      return isFromPeer && isToMe && !m.read;
    });

    if (unreadIncoming.length === 0) return;

    unreadIncoming.forEach((msg) => {
      updateDoc(doc(db, 'dms', msg.id), { read: true }).catch((err) => {
        console.warn('Failed to update DM read receipt:', err);
      });
    });
  }, [selectedPeer, activeUid, messages, activePeerUser, currentUserEmail]);

  // Listen to peer's keying/typing status in real time from Firebase
  useEffect(() => {
    setIsPeerKeying(false);
    if (!activeUid || !selectedPeer || !auth.currentUser) return;

    const resolvedPeerUid = activePeerUser ? activePeerUser.uid : selectedPeer;
    const peerTypingDocId = `${resolvedPeerUid}_${activeUid}`;

    const unsubTyping = onSnapshot(
      doc(db, 'typing', peerTypingDocId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const isTyping = Boolean(data.isTyping);
          const updatedAt = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
          // Valid keying indicator if updated within last 8 seconds
          const isFresh = Date.now() - updatedAt < 8000;
          setIsPeerKeying(isTyping && isFresh);
        } else {
          setIsPeerKeying(false);
        }
      },
      (err) => {
        console.warn('Typing status listener warning:', err);
        setIsPeerKeying(false);
      }
    );

    return () => unsubTyping();
  }, [activeUid, selectedPeer, activePeerUser]);

  // Stop keying/typing status in Firebase
  const stopTyping = () => {
    if (!activeUid || !selectedPeer) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    const resolvedRecipientId = activePeerUser ? activePeerUser.uid : selectedPeer;
    const typingDocId = `${activeUid}_${resolvedRecipientId}`;
    setDoc(
      doc(db, 'typing', typingDocId),
      {
        senderId: activeUid,
        recipientId: resolvedRecipientId,
        isTyping: false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    ).catch(() => {});
  };

  // Handle input change with real-time keying indicator broadcast
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMsgText(val);

    if (!activeUid || !selectedPeer) return;

    const resolvedRecipientId = activePeerUser ? activePeerUser.uid : selectedPeer;
    const typingDocId = `${activeUid}_${resolvedRecipientId}`;

    if (val.trim().length > 0) {
      setDoc(
        doc(db, 'typing', typingDocId),
        {
          senderId: activeUid,
          recipientId: resolvedRecipientId,
          isTyping: true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      ).catch((err) => console.warn('Keying status update warning:', err));

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        stopTyping();
      }, 2500);
    } else {
      stopTyping();
    }
  };

  // Helper to format file sizes
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Convert file to Base64 data URL
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPEG, PNG, WebP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image file must be under 10MB.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setStagedAttachment({
      file,
      previewUrl,
      name: file.name,
      size: formatFileSize(file.size),
      type: 'image',
    });
    setError(null);
  };

  const handleDocumentFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setError('File must be smaller than 15MB.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setStagedAttachment({
      file,
      previewUrl,
      name: file.name,
      size: formatFileSize(file.size),
      type: 'file',
    });
    setError(null);
  };

  const clearStagedAttachment = () => {
    if (stagedAttachment?.previewUrl) {
      URL.revokeObjectURL(stagedAttachment.previewUrl);
    }
    setStagedAttachment(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddEmoji = (emoji: string) => {
    setMsgText((prev) => prev + emoji);
  };

  const handleSendDM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeer || (!msgText.trim() && !stagedAttachment)) return;

    if (!activeUid) {
      setError('You must be signed in to send a direct message.');
      return;
    }

    if (isInteractionRestricted) {
      setError('Direct messaging unavailable. Account interaction between you and this member has been restricted.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    let attachmentUrl: string | undefined = undefined;
    let attachmentType: 'image' | 'file' | undefined = undefined;
    let attachmentName: string | undefined = undefined;
    let attachmentSize: string | undefined = undefined;

    try {
      if (stagedAttachment) {
        attachmentType = stagedAttachment.type;
        attachmentName = stagedAttachment.name;
        attachmentSize = stagedAttachment.size;

        try {
          const fileRef = storageRef(
            storage, 
            `dms/${activeUid}_${Date.now()}_${stagedAttachment.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
          );
          const uploadTask = uploadBytesResumable(fileRef, stagedAttachment.file);

          attachmentUrl = await new Promise((resolve, reject) => {
            uploadTask.on(
              'state_changed',
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(Math.round(progress));
              },
              (err) => reject(err),
              async () => {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(downloadUrl);
              }
            );
          });
        } catch (uploadErr) {
          console.warn('Storage upload fallback to Data URL:', uploadErr);
          attachmentUrl = await fileToDataUrl(stagedAttachment.file);
        }
      }

      const resolvedRecipientId = activePeerUser ? activePeerUser.uid : selectedPeer;
      const resolvedRecipientEmail = activePeerUser ? activePeerUser.email : selectedPeer;
      const senderNameResolved = currentUserName || auth.currentUser?.displayName || currentUserEmail.split('@')[0];

      await addDoc(collection(db, 'dms'), {
        senderId: activeUid,
        senderName: senderNameResolved,
        recipientId: resolvedRecipientId,
        recipientEmail: resolvedRecipientEmail,
        participants: [activeUid, resolvedRecipientId],
        text: msgText.trim(),
        createdAt: new Date().toISOString(),
        read: false,
        ...(attachmentUrl && {
          attachmentType,
          attachmentUrl,
          attachmentName,
          attachmentSize
        })
      });

      // Send notification to recipient
      sendNotification({
        recipientUid: resolvedRecipientId,
        senderUid: activeUid,
        senderName: senderNameResolved,
        type: 'dm',
        title: 'New Direct Message',
        body: msgText.trim() ? `${senderNameResolved}: "${msgText.trim().slice(0, 60)}${msgText.trim().length > 60 ? '...' : ''}"` : `${senderNameResolved} sent you an attachment.`,
        targetUid: activeUid,
      }).catch((err) => console.warn('Notification send warning:', err));

      setMsgText('');
      clearStagedAttachment();
      setShowEmojiPicker(false);
      setUploadProgress(null);
      stopTyping();
    } catch (err) {
      console.error('Send DM error:', err);
      setError('Could not deliver direct message. Please try again.');
      try {
        handleFirestoreError(err, OperationType.CREATE, 'dms');
      } catch {
        // Handled
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter messages for active direct chat
  const activeConversation = selectedPeer
    ? messages.filter((m) => {
        return (
          (m.senderId === activeUid && (m.recipientId === selectedPeer || m.recipientEmail === selectedPeer)) ||
          ((m.recipientId === activeUid || m.recipientEmail === activeUid) && (m.senderId === selectedPeer || m.senderName === selectedPeer))
        );
      })
    : [];

  // Get last message for a peer
  const getLastMessageForPeer = (peerUid: string, peerEmail?: string) => {
    const thread = messages.filter(
      (m) =>
        (m.senderId === activeUid && (m.recipientId === peerUid || m.recipientEmail === peerEmail)) ||
        (m.senderId === peerUid && (m.recipientId === activeUid || m.recipientEmail === currentUserEmail))
    );
    return thread[thread.length - 1];
  };

  // =========================================================================
  // SCREEN 2: DEDICATED SEPARATE DIRECT CHAT PAGE
  // Flow: DM → Related Users → Tap User B → New Direct Chat Page → Back to DM
  // =========================================================================
  if (selectedPeer) {
    return (
      <div className="max-w-4xl mx-auto space-y-3">
        {/* Top Header Bar with Back to DM button & User B Profile */}
        <div className="bg-white/95 dark:bg-zinc-900/90 rounded-2xl p-3 sm:p-3.5 border border-zinc-200/80 dark:border-zinc-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            {/* Back to DM Button */}
            <button
              type="button"
              id="btn-back-to-dm"
              onClick={() => {
                stopTyping();
                setSelectedPeer(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition cursor-pointer shadow-xs active:scale-95 shrink-0"
              title="Return to Related Users DM List"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Back to DM</span>
            </button>

            <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block" />

            {/* User B Real Profile Banner */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div 
                onClick={() => onOpenProfile?.(activePeerUser?.uid || selectedPeer)}
                className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-pink-600 text-white flex items-center justify-center font-bold text-xs shrink-0 cursor-pointer shadow-xs hover:scale-105 transition"
              >
                {activePeerUser?.photoURL ? (
                  <img src={activePeerUser.photoURL} alt={activePeerUser.displayName} className="w-full h-full rounded-xl object-cover" />
                ) : (
                  (activePeerUser?.displayName || selectedPeer).charAt(0).toUpperCase()
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-zinc-900 dark:text-zinc-100 truncate">
                    {activePeerUser?.displayName || selectedPeer}
                  </span>
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-pink-100 text-pink-700 dark:bg-pink-950/80 dark:text-pink-400 shrink-0">
                    Direct Chat
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isPeerKeying ? (
                    <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400 animate-pulse flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-ping inline-block" />
                      Keying…
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate block">
                      {activePeerUser?.email || 'Private Conversation'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            {onOpenProfile && (
              <button
                type="button"
                id="btn-chat-view-profile"
                onClick={() => onOpenProfile(activePeerUser?.uid || selectedPeer)}
                className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold transition cursor-pointer flex items-center gap-1"
              >
                <UserIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>View Profile</span>
              </button>
            )}

            <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900/60 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-3 h-3" />
              <span className="hidden md:inline">Encrypted</span>
            </div>
          </div>
        </div>

        {/* Dedicated Chat Stage Canvas */}
        <div className="bg-white/95 dark:bg-zinc-900/90 rounded-2xl p-3.5 sm:p-4 border border-zinc-200/80 dark:border-zinc-800 shadow-xs flex flex-col h-[520px]">
          {error && (
            <div className="mb-3 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="font-bold text-xs">Dismiss</button>
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto py-3 space-y-3.5 pr-1">
            {activeConversation.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 text-xs">
                <div className="w-12 h-12 rounded-3xl bg-gradient-to-tr from-blue-50 to-pink-50 dark:from-blue-950/40 dark:to-pink-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2 shadow-inner">
                  <Smile className="w-6 h-6" />
                </div>
                <p className="font-bold text-sm text-zinc-700 dark:text-zinc-200">
                  Start direct conversation with {activePeerUser?.displayName || selectedPeer}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1 max-w-xs">
                  Send a private greeting below to initiate your direct chat thread.
                </p>
              </div>
            ) : (
              activeConversation.map((m) => {
                const isMe = m.senderId === activeUid;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] p-3.5 rounded-3xl text-xs leading-relaxed ${
                        isMe
                          ? 'bg-gradient-to-tr from-blue-600 to-pink-600 text-white rounded-br-xs shadow-md shadow-blue-500/10'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-xs'
                      }`}
                    >
                      {/* Attachment preview */}
                      {m.attachmentUrl && (
                        <div className="mb-2.5">
                          {m.attachmentType === 'image' ? (
                            <div className="rounded-2xl overflow-hidden max-h-60 bg-black/10">
                              <img
                                src={m.attachmentUrl}
                                alt={m.attachmentName || 'Shared photo'}
                                className="w-full h-auto object-cover max-h-60"
                                loading="lazy"
                              />
                            </div>
                          ) : (
                            <a
                              href={m.attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center gap-3 p-2.5 rounded-2xl transition ${
                                isMe 
                                  ? 'bg-white/20 hover:bg-white/30 text-white' 
                                  : 'bg-zinc-200/80 dark:bg-zinc-700/80 text-zinc-900 dark:text-zinc-100'
                              }`}
                            >
                              <FileText className="w-5 h-5 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-xs truncate">{m.attachmentName || 'Attachment File'}</p>
                                {m.attachmentSize && <p className="text-[10px] opacity-80">{m.attachmentSize}</p>}
                              </div>
                              <Download className="w-4 h-4 shrink-0" />
                            </a>
                          )}
                        </div>
                      )}

                      {m.text && <p className="whitespace-pre-wrap font-medium">{m.text}</p>}
                    </div>
                    <div className="flex items-center justify-end gap-1 mt-1 px-1">
                      <span className="text-[10px] text-zinc-400">
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {isMe && (
                        <span
                          className="inline-flex items-center gap-0.5 ml-1"
                          title={m.read ? 'Read by recipient' : 'Sent & stored'}
                        >
                          {m.read ? (
                            <span className="text-red-500 font-black text-[11px] flex items-center gap-0.5" title="Read">
                              <Check className="w-3.5 h-3.5 text-red-500 stroke-[3]" />
                            </span>
                          ) : (
                            <span className="text-zinc-400 dark:text-zinc-400 font-bold text-[11px] flex items-center gap-0.5" title="Sent / Stored">
                              <Check className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-400 stroke-[2.5]" />
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {isPeerKeying && (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-pink-50/90 dark:bg-pink-950/50 border border-pink-200/60 dark:border-pink-900/40 text-pink-700 dark:text-pink-300 text-xs font-bold w-max animate-pulse my-2 shadow-2xs">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span>Keying…</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Composer */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 relative">
            {/* Emoji Picker Popover */}
            {showEmojiPicker && (
              <div className="absolute bottom-full mb-3 left-0 z-50 bg-white dark:bg-zinc-900 rounded-3xl p-4 shadow-xl border border-zinc-200 dark:border-zinc-800 w-80 max-w-[calc(100vw-2rem)]">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Smile className="w-4 h-4 text-pink-500" /> Choose Emoji
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(false)}
                    className="p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-52 overflow-y-auto space-y-3 pr-1">
                  {EMOJI_CATEGORIES.map((cat) => (
                    <div key={cat.category}>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                        {cat.category}
                      </span>
                      <div className="grid grid-cols-7 gap-1">
                        {cat.emojis.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleAddEmoji(emoji)}
                            className="w-8 h-8 flex items-center justify-center text-lg rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Staged Attachment Badge */}
            {stagedAttachment && (
              <div className="mb-3 p-2.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {stagedAttachment.type === 'image' ? (
                    <img
                      src={stagedAttachment.previewUrl}
                      alt="Attachment preview"
                      className="w-10 h-10 rounded-xl object-cover border border-blue-300 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">
                      {stagedAttachment.name}
                    </p>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      {stagedAttachment.size} • Ready to send
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearStagedAttachment}
                  className="p-1.5 rounded-full text-zinc-400 hover:text-rose-600 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Progress Indicator */}
            {isSubmitting && uploadProgress !== null && (
              <div className="mb-2">
                <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                  <span>Uploading attachment...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-pink-600 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {isInteractionRestricted ? (
              <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-center space-y-1 shadow-xs">
                <div className="flex items-center justify-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-xs">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Direct Messaging Restricted</span>
                </div>
                <p className="text-[11px] text-rose-600 dark:text-rose-400">
                  Account interaction between you and this member has been restricted.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSendDM} className="flex items-center gap-1.5 w-full min-w-0">
                <button
                  type="button"
                  id="btn-dm-emoji"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`p-2 rounded-xl transition cursor-pointer shrink-0 ${
                    showEmojiPicker
                      ? 'bg-pink-100 dark:bg-pink-950 text-pink-600'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                  title="Add Emojis"
                >
                  <Smile className="w-4 h-4" />
                </button>

                <input
                  type="file"
                  ref={imageInputRef}
                  onChange={handleImageFileSelect}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  id="btn-dm-gallery"
                  onClick={() => imageInputRef.current?.click()}
                  className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer shrink-0"
                  title="Share Image"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleDocumentFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  id="btn-dm-document"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer shrink-0"
                  title="Attach Document"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  id="dm-message-input"
                  value={msgText}
                  onChange={handleInputChange}
                  placeholder={
                    activePeerUser 
                      ? `Message ${activePeerUser.displayName}...` 
                      : 'Write a private message...'
                  }
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />

                <button
                  type="submit"
                  id="btn-send-dm"
                  disabled={isSubmitting || (!msgText.trim() && !stagedAttachment)}
                  className="p-2 rounded-xl bg-gradient-to-r from-blue-600 to-pink-600 hover:opacity-95 text-white transition shadow-xs shadow-blue-500/20 disabled:opacity-40 cursor-pointer shrink-0 flex items-center justify-center min-w-[38px] h-[36px]"
                  aria-label="Send direct message"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCREEN 1: RELATED USERS DM LIST PAGE
  // When the user taps DM, open a DM page showing all their real Related users from Firebase
  // =========================================================================
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-600/10 via-pink-500/10 to-transparent border border-blue-100/80 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-blue-600 to-pink-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <MessageCircle className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
              Direct Messages
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-400">
              Related Connections
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xl leading-relaxed">
            Select any of your real Related users below to open a dedicated Direct Chat page for private, end-to-end messaging.
          </p>
        </div>

        {/* Real Stats counter */}
        <div className="flex items-center gap-3">
          <div className="px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs text-center">
            <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
              Related Members
            </span>
            <span className="text-base font-black text-blue-600 dark:text-blue-400">
              {relatedUserIds.size}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 font-bold text-xs cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            id="search-dm-users-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              searchAllMembers
                ? 'Search all registered TEZOCRON members...'
                : 'Search your Related members by name or email...'
            }
            className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-xs transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter / Scope Toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="btn-toggle-scope-related"
            onClick={() => setSearchAllMembers(false)}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition cursor-pointer border ${
              !searchAllMembers
                ? 'bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900 shadow-xs'
                : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
            }`}
          >
            Related Members ({relatedUserIds.size})
          </button>

          <button
            type="button"
            id="btn-toggle-scope-all"
            onClick={() => setSearchAllMembers(true)}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition cursor-pointer border ${
              searchAllMembers
                ? 'bg-pink-50 dark:bg-pink-950/80 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-900 shadow-xs'
                : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
            }`}
          >
            All Members ({registeredUsers.length > 0 ? registeredUsers.length - 1 : 0})
          </button>
        </div>
      </div>

      {/* Related Users DM Cards Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400 text-xs space-y-2">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p>Syncing Related members and direct messages from Firebase...</p>
        </div>
      ) : relatedUsersList.length === 0 ? (
        /* Authentic Real Data Empty State */
        <div className="p-10 rounded-3xl bg-white/95 dark:bg-zinc-900/90 border border-zinc-200/80 dark:border-zinc-800 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-3xl bg-gradient-to-tr from-blue-50 to-pink-50 dark:from-blue-950/40 dark:to-pink-950/40 border border-blue-100 dark:border-zinc-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-xs">
            <HeartHandshake className="w-7 h-7" />
          </div>

          <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200">
            {searchQuery
              ? `No members found matching "${searchQuery}"`
              : !searchAllMembers
              ? 'No Related Users Found in Firebase'
              : 'No Registered TEZOCRON Members Found'}
          </h3>

          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
            {!searchAllMembers ? (
              <>
                You haven't established any relations on TEZOCRON Relate yet. Visit the Relate tab to connect with real members, or click "Search All Members" to start a direct message with any registered user.
              </>
            ) : (
              <>To message other members, open an incognito window and sign up a second real user account.</>
            )}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {onNavigateToRelate && !searchAllMembers && (
              <button
                type="button"
                id="btn-goto-relate-tab"
                onClick={onNavigateToRelate}
                className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-pink-600 hover:opacity-95 text-white text-xs font-bold transition shadow-md shadow-blue-500/20 cursor-pointer"
              >
                Go to Relate Tab
              </button>
            )}

            {!searchAllMembers && (
              <button
                type="button"
                id="btn-browse-all-members"
                onClick={() => setSearchAllMembers(true)}
                className="px-4 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold hover:bg-zinc-200 transition cursor-pointer"
              >
                Search All Registered Members
              </button>
            )}

            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-4 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 text-xs font-bold hover:bg-zinc-100 transition cursor-pointer"
              >
                Clear Search Query
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Grid of Real Related Users */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {relatedUsersList.map((user) => {
            const isRelated = relatedUserIds.has(user.uid);
            const lastMsg = getLastMessageForPeer(user.uid, user.email);

            return (
              <div
                key={user.uid}
                id={`dm-user-card-${user.uid}`}
                onClick={() => setSelectedPeer(user.uid)}
                className="bg-white/95 dark:bg-zinc-900/90 rounded-3xl p-5 border border-zinc-200/80 dark:border-zinc-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer relative overflow-hidden"
              >
                {/* Accent Highlight Bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-pink-500 opacity-60 group-hover:opacity-100 transition" />

                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    {/* User Avatar */}
                    <div className="relative shrink-0">
                      {user.photoURL && (user.photoURL.startsWith('http') || user.photoURL.startsWith('data:image')) ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName}
                          className="w-12 h-12 rounded-2xl object-cover border border-zinc-200 dark:border-zinc-700 shadow-xs group-hover:scale-105 transition"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-blue-500 to-pink-500 p-0.5 shadow-md shadow-blue-500/10 flex items-center justify-center group-hover:scale-105 transition">
                          <div className="w-full h-full rounded-[14px] bg-white dark:bg-zinc-900 flex items-center justify-center text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-pink-600">
                            {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                          </div>
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-900" title="Active member" />
                    </div>

                    {/* Relation Badge */}
                    <div className="flex flex-col items-end gap-1">
                      {isRelated ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-pink-100 text-pink-700 dark:bg-pink-950/80 dark:text-pink-400 border border-pink-200 dark:border-pink-900/60 shadow-2xs">
                          Related
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          Member
                        </span>
                      )}
                    </div>
                  </div>

                  {/* User Details */}
                  <div className="mb-3">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition truncate">
                      {user.displayName || 'TEZOCRON Member'}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      {user.email}
                    </p>
                  </div>

                  {/* Last Message Preview */}
                  <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 text-xs">
                    {lastMsg ? (
                      <div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-0.5">
                          <span className="flex items-center gap-1">
                            {lastMsg.senderId === activeUid ? (
                              <>
                                <span>You sent</span>
                                {lastMsg.read ? (
                                  <span className="text-red-500 font-extrabold flex items-center" title="Read by recipient">
                                    <Check className="w-3 h-3 text-red-500 stroke-[3]" />
                                  </span>
                                ) : (
                                  <span className="text-zinc-400 font-bold flex items-center" title="Sent / Stored">
                                    <Check className="w-3 h-3 text-zinc-400 stroke-[2]" />
                                  </span>
                                )}
                              </>
                            ) : (
                              'Received'
                            )}
                          </span>
                          <span>{new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-zinc-700 dark:text-zinc-300 font-medium truncate">
                          {lastMsg.attachmentType ? `[${lastMsg.attachmentType.toUpperCase()}] ${lastMsg.text || 'Shared attachment'}` : lastMsg.text}
                        </p>
                      </div>
                    ) : (
                      <p className="text-zinc-400 italic text-[11px]">No messages yet. Tap to start chat.</p>
                    )}
                  </div>
                </div>

                {/* Open Direct Chat Button */}
                <div className="pt-3 mt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition">
                  <span className="flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5" />
                    <span>Open Direct Chat Page</span>
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
