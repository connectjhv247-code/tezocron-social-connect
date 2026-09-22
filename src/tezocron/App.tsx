import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, DocumentSnapshot } from 'firebase/firestore';
import { auth, db, testConnection } from './firebase';
import { AuthView } from './AuthView';
import { LoadingScreen } from './components/LoadingScreen';
import { SocialChat } from './components/SocialChat';
import { RelateView } from './components/RelateView';
import { DirectMessages } from './components/DirectMessages';
import { UserProfileModal } from './components/UserProfileModal';
import { AdditionalMenuModal, SystemMenuOption } from './components/AdditionalMenuModal';
import { SettingsView } from './components/SettingsView';
import { PrivacyPolicyView } from './components/PrivacyPolicyView';
import { TermsOfServiceView } from './components/TermsOfServiceView';
import { FAQSupportView } from './components/FAQSupportView';
import { NotificationsView } from './components/NotificationsView';
import { PageTransition, modalZoomVariants, backdropVariants } from './components/PageTransition';
import { ensureRelateHandle, resolveRelateHandle } from './lib/relateLinkService';
import { 
  MessageSquare, 
  HeartHandshake, 
  Send, 
  Menu, 
  LogOut, 
  Sparkles,
  Smartphone,
  ShieldCheck,
  ChevronRight,
  ArrowLeft,
  Bell,
  User as UserIcon,
  LogIn,
  X,
  Lock,
  Moon,
  Sun
} from 'lucide-react';

type MainNavTab = 'social_chat' | 'relate' | 'dm' | 'notifications' | 'settings' | 'privacy' | 'terms' | 'faq';

interface AppProps {
  /** Public Relate handle from a shared Relate Link (/r/<handle>) */
  relateHandle?: string;
}

export default function App({ relateHandle }: AppProps = {}) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [relateLinkStatus, setRelateLinkStatus] = useState<'idle' | 'resolving' | 'notfound' | 'self' | 'done'>(
    relateHandle ? 'resolving' : 'idle'
  );
  const [userProfile, setUserProfile] = useState<{ displayName?: string; role?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MainNavTab>('social_chat');
  const [selectedDmRecipient, setSelectedDmRecipient] = useState<string | undefined>(undefined);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Theme & Auth requirement settings
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('tezocron_theme');
    if (saved) return saved === 'dark';
    return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  });

  const [requireAuth, setRequireAuth] = useState<boolean>(() => {
    return localStorage.getItem('tezocron_require_auth') !== 'false';
  });

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalReason, setAuthModalReason] = useState<string | null>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('tezocron_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('tezocron_theme', 'light');
    }
  }, [isDarkMode]);

  const handleToggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  const handleToggleRequireAuth = () => {
    setRequireAuth((prev) => {
      const next = !prev;
      localStorage.setItem('tezocron_require_auth', String(next));
      return next;
    });
  };

  const triggerAuthModal = (reason?: string) => {
    setAuthModalReason(reason || 'Sign in with Firebase Auth to access protected platform features.');
    setAuthModalOpen(true);
  };

  useEffect(() => {
    // Validate connection
    testConnection();

    // Listen to real Firebase Authentication state changes
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        
        // Listen to live updates on the current user profile document
        let retryTimer: NodeJS.Timeout | null = null;
        const unsubUserDoc = onSnapshot(userDocRef, async (snap: DocumentSnapshot) => {
          if (snap.exists()) {
            setUserProfile(snap.data() as any);
          } else {
            const initialProfile = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || user.email?.split('@')[0] || 'Member',
              photoURL: user.photoURL || '',
              createdAt: new Date().toISOString(),
              role: 'Member',
              privacySettings: {
                emailVisibility: 'related',
                bioVisibility: 'public',
                showRelateStatus: true,
              }
            };
            try {
              await setDoc(userDocRef, initialProfile, { merge: true });
              setUserProfile(initialProfile);
            } catch (err) {
              console.warn('Initial profile creation warning:', err);
            }
          }
          setAuthLoading(false);
        }, (err) => {
          console.warn('User doc snapshot non-fatal notice (retrying/fallback):', err);
          const fallbackProfile = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || user.email?.split('@')[0] || 'Member',
            role: 'Member'
          };
          setUserProfile(fallbackProfile);
          setAuthLoading(false);

          // Retry snapshot once after short delay if initial auth token was syncing
          retryTimer = setTimeout(async () => {
            try {
              const snap = await getDoc(userDocRef);
              if (snap.exists()) {
                setUserProfile(snap.data() as any);
              } else {
                await setDoc(userDocRef, fallbackProfile, { merge: true });
              }
            } catch (retryErr) {
              console.warn('Profile retry non-fatal notice:', retryErr);
            }
          }, 800);
        });

        return () => {
          unsubUserDoc();
          if (retryTimer) clearTimeout(retryTimer);
        };
      } else {
        setUserProfile(null);
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Make sure every signed-in member has their own shareable Relate Link
  useEffect(() => {
    if (!currentUser?.uid) return;
    ensureRelateHandle(currentUser.uid, currentUser.displayName || undefined);
  }, [currentUser?.uid]);

  // Open a shared Relate Link: resolve it to the real member profile
  useEffect(() => {
    if (!relateHandle || !currentUser?.uid || relateLinkStatus === 'done') return;
    let active = true;
    setRelateLinkStatus('resolving');

    resolveRelateHandle(relateHandle).then((target) => {
      if (!active) return;
      if (!target) {
        setRelateLinkStatus('notfound');
        return;
      }
      if (target.uid === currentUser.uid) {
        setActiveTab('relate');
        setRelateLinkStatus('self');
        return;
      }
      setActiveTab('relate');
      setProfileModalUserId(target.uid);
      setRelateLinkStatus('done');
    });

    return () => {
      active = false;
    };
  }, [relateHandle, currentUser?.uid, relateLinkStatus]);


  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setActiveTab('social_chat');
    } catch (err) {
      console.warn('Sign out notice:', err);
    }
  };

  // 1. Initial Launch: Show TEZOCRON loading screen while Firebase verifies auth session
  if (authLoading) {
    return <LoadingScreen />;
  }

  // 2. Unauthenticated with Require Authentication ON: Enforce Login/Create Account Screen directly
  if (!currentUser && requireAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50/40 via-white to-pink-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 flex flex-col justify-center items-center p-4 sm:p-6">
        <div className="w-full max-w-md my-auto">
          <AuthView onSuccess={() => {
            // Callback triggers state update via onAuthStateChanged
          }} />
        </div>
      </div>
    );
  }

  // 3 & 4 & 5. TEZOCRON Home Screen (Supports both authenticated users and public mode when Require Auth is OFF)
  const currentUserId = currentUser?.uid || '';
  const currentUserName = userProfile?.displayName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Guest Visitor';
  const currentUserEmail = currentUser?.email || '';

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0c0c0e] text-zinc-900 dark:text-zinc-100 flex flex-col font-sans antialiased selection:bg-pink-500 selection:text-white">
      
      {/* Top Navigation Bar with TEZOCRON blue, white, and pink system */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-13 flex items-center justify-between">
          
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl overflow-hidden shadow-xs border border-zinc-200/60 dark:border-zinc-800 bg-[#050819] shrink-0">
              <img
                src="/tezocron-logo.png"
                alt="TEZOCRON Logo"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <h1 className="font-black text-base tracking-tight text-zinc-900 dark:text-white leading-none">
                  TEZOCRON
                </h1>
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
              </div>
              <p className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 mt-0.5">
                JMP (Jaz media parustarta)
              </p>
            </div>
          </div>

          {/* Center Navigation for Desktop: Social Chat, Relate, DM, Notifications */}
          <nav className="hidden md:flex items-center gap-0.5 p-0.5 bg-zinc-100/90 dark:bg-zinc-800/80 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
            <button
              type="button"
              id="nav-tab-social-chat"
              onClick={() => setActiveTab('social_chat')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'social_chat'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Social Chat</span>
            </button>

            <button
              type="button"
              id="nav-tab-relate"
              onClick={() => setActiveTab('relate')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'relate'
                  ? 'bg-white dark:bg-zinc-900 text-pink-600 dark:text-pink-400 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <HeartHandshake className="w-3.5 h-3.5" />
              <span>Relate</span>
            </button>

            <button
              type="button"
              id="nav-tab-dm"
              onClick={() => setActiveTab('dm')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'dm'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>DM</span>
            </button>

            <button
              type="button"
              id="nav-tab-notifications"
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'notifications'
                  ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Notifications</span>
            </button>
          </nav>

          {/* Right Action Controls: Additional Menu & Logout */}
          <div className="flex items-center gap-1.5">
            {/* Bell Icon Quick Button for Mobile / All screen sizes */}
            <button
              type="button"
              id="btn-quick-notifications"
              onClick={() => setActiveTab('notifications')}
              className={`p-1.5 rounded-xl border transition cursor-pointer flex items-center justify-center ${
                activeTab === 'notifications'
                  ? 'bg-purple-100 text-purple-600 dark:bg-purple-950/80 dark:text-purple-400 border-purple-200 dark:border-purple-800'
                  : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500'
              }`}
              title="Notifications"
            >
              <Bell className="w-3.5 h-3.5" />
            </button>

            {/* Additional Menu button with modern TEZOCRON rounded design */}
            <button
              type="button"
              id="btn-open-additional-menu"
              onClick={() => setMenuOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-50 to-pink-50 hover:from-blue-100 hover:to-pink-100 dark:from-blue-950/60 dark:to-pink-950/40 dark:hover:from-blue-900/60 dark:hover:to-pink-900/50 border border-blue-200/80 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
              title="Open System Menu"
            >
              <Menu className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Menu</span>
            </button>

            {/* Logout or Sign In button */}
            {currentUser ? (
              <button
                type="button"
                id="btn-sign-out"
                onClick={() => setShowLogoutConfirm(true)}
                className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            ) : (
              <button
                type="button"
                id="btn-guest-sign-in"
                onClick={() => triggerAuthModal('Sign in with your TEZOCRON Firebase account to unlock all features.')}
                className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-pink-600 hover:opacity-95 text-white text-xs font-bold transition shadow-sm shadow-blue-500/20 cursor-pointer flex items-center gap-1"
                title="Sign In with Firebase"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div 
            id="logout-confirm-backdrop"
            onClick={() => setShowLogoutConfirm(false)}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={backdropVariants}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm overflow-y-auto"
          >
            <motion.div 
              id="logout-confirm-modal"
              onClick={(e) => e.stopPropagation()}
              initial="initial"
              animate="animate"
              exit="exit"
              variants={modalZoomVariants}
              className="w-full max-w-xs sm:max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-4 sm:p-5 border border-zinc-200 dark:border-zinc-800 shadow-xl relative overflow-hidden text-center space-y-3 my-auto"
            >
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center">
                <LogOut className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>

              <div>
                <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                  Confirm Log Out
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Are you sure you want to log out of your TEZOCRON account?
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  id="btn-cancel-logout"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="btn-confirm-logout"
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    handleSignOut();
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition shadow-xs cursor-pointer"
                >
                  Confirm Log Out
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Dashboard Canvas */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-2.5 sm:px-4 py-3 sm:py-4 pb-20 md:pb-4">
        
        {/* Back navigation pill if viewing a menu page (Settings, Privacy, Terms, FAQ, Notifications) */}
        {activeTab !== 'social_chat' && activeTab !== 'relate' && activeTab !== 'dm' && (
          <div className="mb-2.5">
            <button
              type="button"
              id="btn-back-to-social"
              onClick={() => setActiveTab('social_chat')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer shadow-xs active:scale-95"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Social Chat</span>
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* Tab 1: Social Chat Screen */}
          {activeTab === 'social_chat' && (
            <PageTransition keyId="social_chat">
              <SocialChat
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                currentUserEmail={currentUserEmail}
                onOpenProfile={(uid) => setProfileModalUserId(uid)}
                onRequireAuth={triggerAuthModal}
                onNavigateToDM={(recipientUid) => {
                  setSelectedDmRecipient(recipientUid);
                  setActiveTab('dm');
                }}
              />
            </PageTransition>
          )}

          {/* Tab 2: Relate Screen */}
          {activeTab === 'relate' && (
            <PageTransition keyId="relate">
              <RelateView
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                currentUserEmail={currentUserEmail}
                onNavigateToDM={(recipient) => {
                  setSelectedDmRecipient(recipient);
                  setActiveTab('dm');
                }}
                onOpenProfile={(uid) => setProfileModalUserId(uid)}
                onRequireAuth={triggerAuthModal}
              />
            </PageTransition>
          )}

          {/* Tab 3: DM Screen */}
          {activeTab === 'dm' && (
            <PageTransition keyId="dm">
              <DirectMessages
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                currentUserEmail={currentUserEmail}
                initialRecipient={selectedDmRecipient}
                onOpenProfile={(uid) => setProfileModalUserId(uid)}
                onNavigateToRelate={() => setActiveTab('relate')}
                onRequireAuth={triggerAuthModal}
              />
            </PageTransition>
          )}

          {/* Tab 4: Notifications Screen */}
          {activeTab === 'notifications' && (
            <PageTransition keyId="notifications">
              <NotificationsView
                currentUserId={currentUserId}
                onNavigateToDM={(recipient) => {
                  setSelectedDmRecipient(recipient);
                  setActiveTab('dm');
                }}
                onOpenProfile={(uid) => setProfileModalUserId(uid)}
                onNavigateToRelate={() => setActiveTab('relate')}
                onRequireAuth={triggerAuthModal}
              />
            </PageTransition>
          )}

          {/* Menu Option Screen 1: Settings */}
          {activeTab === 'settings' && (
            <PageTransition keyId="settings">
              <SettingsView
                currentUser={currentUser}
                currentUserName={currentUserName}
                isDarkMode={isDarkMode}
                onToggleDarkMode={handleToggleDarkMode}
                requireAuth={requireAuth}
                onToggleRequireAuth={handleToggleRequireAuth}
                onRequireAuth={triggerAuthModal}
                onUpdateName={(newName) => {
                  setUserProfile((prev) => ({
                    displayName: newName,
                    role: prev?.role || 'Member',
                  }));
                }}
              />
            </PageTransition>
          )}

          {/* Menu Option Screen 2: Privacy Policy */}
          {activeTab === 'privacy' && (
            <PageTransition keyId="privacy">
              <PrivacyPolicyView />
            </PageTransition>
          )}

          {/* Menu Option Screen 3: Terms of Service */}
          {activeTab === 'terms' && (
            <PageTransition keyId="terms">
              <TermsOfServiceView />
            </PageTransition>
          )}

          {/* Menu Option Screen 4: FAQ & Support */}
          {activeTab === 'faq' && (
            <PageTransition keyId="faq">
              <FAQSupportView currentUserEmail={currentUserEmail} />
            </PageTransition>
          )}
        </AnimatePresence>
      </main>

      {/* Auth Modal for Guest Users */}
      <AnimatePresence>
        {authModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400">
                  <Lock className="w-4 h-4" />
                  <span>TEZOCRON Authentication</span>
                </div>
                <button
                  type="button"
                  id="btn-close-auth-modal"
                  onClick={() => setAuthModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {authModalReason && (
                <div className="p-3 rounded-2xl bg-blue-50/80 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900/60 text-xs text-blue-800 dark:text-blue-300 font-medium">
                  {authModalReason}
                </div>
              )}

              <AuthView onSuccess={() => {
                setAuthModalOpen(false);
              }} />
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Additional Menu Modal */}
      <AnimatePresence>
        {menuOpen && (
          <AdditionalMenuModal
            isOpen={menuOpen}
            onClose={() => setMenuOpen(false)}
            userName={currentUserName}
            userEmail={currentUserEmail}
            onOpenProfile={() => {
              if (currentUser?.uid) {
                setProfileModalUserId(currentUser.uid);
              } else {
                triggerAuthModal('Sign in to view your user profile.');
              }
            }}
            onSelectOption={(option: SystemMenuOption) => {
              setMenuOpen(false);
              if (option === 'logout') {
                if (currentUser) {
                  setShowLogoutConfirm(true);
                } else {
                  triggerAuthModal('Sign in with your TEZOCRON account.');
                }
              } else if (option === 'settings') {
                setActiveTab('settings');
              } else if (option === 'notifications') {
                setActiveTab('notifications');
              } else if (option === 'privacy') {
                setActiveTab('privacy');
              } else if (option === 'terms') {
                setActiveTab('terms');
              } else if (option === 'faq') {
                setActiveTab('faq');
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Real User Profile Modal */}
      <AnimatePresence>
        {Boolean(profileModalUserId) && (
          <UserProfileModal
            isOpen={Boolean(profileModalUserId)}
            onClose={() => setProfileModalUserId(null)}
            userId={profileModalUserId}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserEmail={currentUserEmail}
            onNavigateToDM={(recipient) => {
              setSelectedDmRecipient(recipient);
              setActiveTab('dm');
            }}
            onProfileUpdated={(updated) => {
              if (updated.uid === currentUserId) {
                setUserProfile({
                  displayName: updated.displayName,
                  role: updated.role,
                });
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Mobile Navigation Bar at the bottom of the screen */}
      <div 
        id="mobile-bottom-nav"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-1.5 border-t border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-lg shadow-lg shadow-black/5"
      >
        <button
          type="button"
          id="mobile-nav-social-chat"
          onClick={() => setActiveTab('social_chat')}
          className={`flex flex-col items-center gap-0.5 py-0.5 px-3 rounded-xl text-[10px] font-bold transition cursor-pointer ${
            activeTab === 'social_chat'
              ? 'text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/60 shadow-xs'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Social Chat</span>
        </button>

        <button
          type="button"
          id="mobile-nav-relate"
          onClick={() => setActiveTab('relate')}
          className={`flex flex-col items-center gap-0.5 py-0.5 px-3 rounded-xl text-[10px] font-bold transition cursor-pointer ${
            activeTab === 'relate'
              ? 'text-pink-600 dark:text-pink-400 bg-pink-50/80 dark:bg-pink-950/60 shadow-xs'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <HeartHandshake className="w-4 h-4" />
          <span>Relate</span>
        </button>

        <button
          type="button"
          id="mobile-nav-dm"
          onClick={() => setActiveTab('dm')}
          className={`flex flex-col items-center gap-0.5 py-0.5 px-3 rounded-xl text-[10px] font-bold transition cursor-pointer ${
            activeTab === 'dm'
              ? 'text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/60 shadow-xs'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>DM</span>
        </button>
      </div>
    </div>
  );
}
