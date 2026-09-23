import React, { useEffect, useState } from 'react';
import { Link2, Copy, Check, Share2, Mail, MessageCircle, Send, Smartphone, Loader2 } from 'lucide-react';
import { ensureRelateHandle, buildRelateLink, buildRelateShareMessage } from '../lib/relateLinkService';

interface RelateLinkCardProps {
  currentUserId: string;
  currentUserName: string;
}

/**
 * Personal Relate Link: a unique shareable link for the signed-in member.
 * Anyone who opens it lands on this member's real profile and can relate.
 */
export const RelateLinkCard: React.FC<RelateLinkCardProps> = ({ currentUserId, currentUserName }) => {
  const [handle, setHandle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    if (!currentUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    ensureRelateHandle(currentUserId, currentUserName)
      .then((result) => {
        if (active) setHandle(result);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentUserId, currentUserName]);

  if (!currentUserId) return null;

  const link = handle ? buildRelateLink(handle) : '';
  const message = handle ? buildRelateShareMessage(currentUserName || 'me', link) : '';

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const temp = document.createElement('textarea');
      temp.value = link;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleShare = async () => {
    if (!link) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'TEZOCRON Relate Link', text: message, url: link });
        return;
      } catch {
        // User dismissed the share sheet
      }
    }
    handleCopy();
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white/95 dark:bg-zinc-900/90 border border-zinc-200/80 dark:border-zinc-800 shadow-xs space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-pink-500 text-white flex items-center justify-center shadow-xs">
          <Link2 className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 leading-none">
            Your Relate Link
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
            Share it anywhere. Anyone who opens it can relate with you on TEZOCRON.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Preparing your personal link…</span>
        </div>
      ) : !handle ? (
        <p className="text-xs text-rose-600 font-semibold">
          Your Relate Link is not available right now. Please try again in a moment.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div
              id="relate-link-value"
              className="flex-1 min-w-0 px-3.5 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate"
            >
              {link}
            </div>
            <button
              type="button"
              id="btn-copy-relate-link"
              onClick={handleCopy}
              className="px-3.5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
              title="Copy your Relate Link"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="btn-share-relate-link"
              onClick={handleShare}
              className="px-3.5 py-2 rounded-2xl bg-gradient-to-r from-blue-600 to-pink-500 text-white text-xs font-bold flex items-center gap-1.5 transition hover:opacity-90 cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>

            <a
              id="btn-share-relate-whatsapp"
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-2xl bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-600/20 transition cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </a>

            <a
              id="btn-share-relate-telegram"
              href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-2xl bg-sky-600/10 text-sky-700 dark:text-sky-400 border border-sky-500/30 text-xs font-bold flex items-center gap-1.5 hover:bg-sky-600/20 transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Telegram</span>
            </a>

            <a
              id="btn-share-relate-sms"
              href={`sms:?&body=${encodeURIComponent(message)}`}
              className="px-3.5 py-2 rounded-2xl bg-violet-600/10 text-violet-700 dark:text-violet-400 border border-violet-500/30 text-xs font-bold flex items-center gap-1.5 hover:bg-violet-600/20 transition cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>SMS</span>
            </a>

            <a
              id="btn-share-relate-email"
              href={`mailto:?subject=${encodeURIComponent('Connect with me on TEZOCRON')}&body=${encodeURIComponent(message)}`}
              className="px-3.5 py-2 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 text-xs font-bold flex items-center gap-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Email</span>
            </a>
          </div>
        </>
      )}
    </div>
  );
};

export default RelateLinkCard;
