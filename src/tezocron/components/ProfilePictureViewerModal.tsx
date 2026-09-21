import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck } from 'lucide-react';
import { modalZoomVariants, backdropVariants } from './PageTransition';

interface ProfilePictureViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  photoURL?: string | null;
  displayName?: string;
  role?: string;
  userId?: string;
  onOpenFullProfile?: (userId: string) => void;
}

export const ProfilePictureViewerModal: React.FC<ProfilePictureViewerModalProps> = ({
  isOpen,
  onClose,
  photoURL,
  displayName = 'Member',
  role = 'Member',
  userId,
  onOpenFullProfile,
}) => {
  if (!isOpen) return null;

  const hasRealPhoto = Boolean(
    photoURL && (photoURL.startsWith('http') || photoURL.startsWith('data:image'))
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="profile-picture-viewer-backdrop"
          onClick={onClose}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={backdropVariants}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
        >
          <motion.div
            id="profile-picture-viewer-card"
            onClick={(e) => e.stopPropagation()}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={modalZoomVariants}
            className="w-full max-w-lg bg-zinc-900 text-white rounded-3xl p-5 sm:p-6 border border-zinc-800 shadow-2xl relative my-auto flex flex-col items-center text-center space-y-4"
          >
            {/* Header controls */}
            <div className="w-full flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg overflow-hidden shrink-0 border border-zinc-700 bg-[#050819]">
                  <img
                    src="/tezocron-logo.png"
                    alt="TEZOCRON Logo"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-xs font-bold text-zinc-300">
                  Profile Picture View
                </span>
              </div>

              <button
                type="button"
                id="btn-close-picture-viewer"
                onClick={onClose}
                className="p-2 rounded-2xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                title="Close picture view"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Main Picture Frame */}
            <div className="w-full flex items-center justify-center my-2 min-h-[220px]">
              {hasRealPhoto ? (
                <div className="relative group max-w-full">
                  <img
                    src={photoURL!}
                    alt={displayName}
                    className="max-w-full max-h-[65vh] object-contain rounded-3xl border-2 border-pink-500/80 shadow-2xl bg-zinc-950"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute bottom-3 right-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Real Uploaded Picture</span>
                  </div>
                </div>
              ) : (
                <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-full bg-gradient-to-tr from-blue-600 via-blue-500 to-pink-500 p-1 shadow-2xl flex items-center justify-center">
                  <div className="w-full h-full rounded-full bg-zinc-900 flex flex-col items-center justify-center p-4">
                    <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-pink-500 mb-2">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                    <p className="text-[10px] text-zinc-400 font-medium">
                      No custom profile photo uploaded yet
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* User Meta Footer */}
            <div className="w-full pt-3 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-left">
                <h4 className="text-sm font-black text-white flex items-center gap-1.5">
                  <span>{displayName}</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </h4>
                <p className="text-[11px] text-zinc-400">
                  {role} &bull; Verified TEZOCRON User
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {userId && onOpenFullProfile && (
                  <button
                    type="button"
                    id="btn-view-member-profile-from-viewer"
                    onClick={() => {
                      onClose();
                      onOpenFullProfile(userId);
                    }}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-2xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-bold transition cursor-pointer"
                  >
                    View Full Profile
                  </button>
                )}

                <button
                  type="button"
                  id="btn-close-view-return"
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-5 py-2 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition cursor-pointer"
                >
                  Close View
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
