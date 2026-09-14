"use client";

import { useState } from "react";
import { MessageCircle, Phone, UserRound, Users } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { ProfilePanel } from "@/components/layout/ProfilePanel";
import { ConversationView } from "@/features/chat/ConversationView";
import { GroupConversationView } from "@/features/chat/GroupConversationView";
import { GroupSettingsPanel } from "@/features/chat/GroupSettingsPanel";
import { CallOverlay } from "@/features/calls/CallOverlay";
import { AddUserDialog } from "@/features/contacts/AddUserDialog";
import { CreateGroupDialog } from "@/features/contacts/CreateGroupDialog";
import { ContactsManager } from "@/features/contacts";
import { useAuth } from "@/features/auth/AuthProvider";
import { cn } from "@/lib/utils";

type MobileTab = "chats" | "contacts" | "call" | "profile";

export function AppShell() {
  const { profile } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [panelUsername, setPanelUsername] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chats");
  const [mainView, setMainView] = useState<"chat" | "contacts">("chat");
  const [showConversationMobile, setShowConversationMobile] = useState(false);

  const isGroup = !!conversationId?.startsWith("grp_");
  const panelOpen = settingsOpen || !!panelUsername || (groupSettingsOpen && isGroup);

  const selectConversation = (id: string) => {
    setConversationId(id);
    setMainView("chat");
    setShowConversationMobile(true);
    setMobileTab("chats");
    if (!id.startsWith("grp_")) {
      setGroupSettingsOpen(false);
    }
  };

  const openContactsView = () => {
    setMainView("contacts");
    setShowConversationMobile(true);
    setMobileTab("contacts");
  };

  return (
    <div className="app-shell mx-auto max-w-[1600px] p-0 md:p-4">
      <div className="glass-panel flex h-full min-h-0 overflow-hidden md:h-[calc(100dvh-2rem)] specular">
        <div
          className={cn(
            "h-full w-full shrink-0 md:w-[320px] lg:w-[340px]",
            showConversationMobile ? "hidden md:flex md:flex-col" : "flex flex-col",
            (mobileTab === "profile" || (mobileTab === "contacts" && showConversationMobile)) && "hidden md:flex",
          )}
        >
          <Sidebar
            activeConversationId={conversationId}
            onSelectConversation={selectConversation}
            onOpenSettings={() => {
              setSettingsOpen(true);
              setPanelUsername(null);
              setMobileTab("profile");
            }}
            onAddUser={() => setAddUserOpen(true)}
            onCreateGroup={() => setCreateGroupOpen(true)}
            onOpenContacts={openContactsView}
            onOpenProfile={(username) => {
              setPanelUsername(username);
              setSettingsOpen(false);
              setMobileTab("profile");
            }}
          />
        </div>

        <main
          className={cn(
            "min-w-0 flex-1 bg-white/20",
            !showConversationMobile && "hidden md:block",
            mobileTab === "profile" && "hidden md:block",
          )}
        >
          <div className="flex h-12 items-center border-b border-white/40 px-3 md:hidden">
            <button
              type="button"
              className="text-sm font-medium text-sky-600"
              onClick={() => setShowConversationMobile(false)}
            >
              ← Back
            </button>
          </div>
          <div className="h-[calc(100%-3rem)] md:h-full">
            {mainView === "contacts" ? (
              <ContactsManager
                onOpenConversation={(id) => {
                  selectConversation(id);
                }}
                onOpenProfile={(username) => {
                  setPanelUsername(username);
                  setSettingsOpen(false);
                  setMobileTab("profile");
                }}
                onAddUser={() => setAddUserOpen(true)}
              />
            ) : isGroup ? (
              <GroupConversationView
                groupId={conversationId!}
                onOpenGroupSettings={() => setGroupSettingsOpen((prev) => !prev)}
              />
            ) : (
              <ConversationView
                conversationId={conversationId}
                onOpenProfile={(username) => {
                  setPanelUsername(username);
                  setSettingsOpen(false);
                  setMobileTab("profile");
                }}
              />
            )}
          </div>
        </main>

        <div
          className={cn(
            "hidden w-[300px] shrink-0 xl:block",
            panelOpen && "xl:block",
            mobileTab === "profile" && "block w-full md:w-[300px]",
            !panelOpen && mobileTab !== "profile" && "hidden",
          )}
        >
          {(panelOpen || mobileTab === "profile") && (
            groupSettingsOpen && isGroup ? (
              <GroupSettingsPanel
                groupId={conversationId!}
                onClose={() => setGroupSettingsOpen(false)}
                onGroupLeft={() => {
                  setConversationId(null);
                  setGroupSettingsOpen(false);
                }}
              />
            ) : (
              <ProfilePanel
                mode={settingsOpen || (!panelUsername && mobileTab === "profile") ? "settings" : "peer"}
                username={panelUsername}
                onClose={() => {
                  setSettingsOpen(false);
                  setPanelUsername(null);
                  setMobileTab("chats");
                }}
                onOpenConversation={(id) => {
                  selectConversation(id);
                  setPanelUsername(null);
                }}
              />
            )
          )}
          {!panelOpen && mobileTab !== "profile" && (
            <div className="hidden h-full items-center justify-center p-6 text-center xl:flex">
              <div>
                <p className="font-display text-lg font-semibold text-slate-700">
                  {profile?.displayName}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Open a chat or profile for details
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/50 bg-white/70 px-6 py-2 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <TabButton
            active={mobileTab === "chats" && mainView === "chat"}
            label="Chats"
            onClick={() => {
              setMobileTab("chats");
              setMainView("chat");
              setShowConversationMobile(false);
            }}
            icon={<MessageCircle className="h-5 w-5" />}
          />
          <TabButton
            active={mobileTab === "contacts" || (mobileTab === "chats" && mainView === "contacts")}
            label="Contacts"
            onClick={() => {
              setMobileTab("contacts");
              setMainView("contacts");
              setShowConversationMobile(true);
            }}
            icon={<Users className="h-5 w-5" />}
          />
          <TabButton
            active={mobileTab === "call"}
            label="Call"
            onClick={() => setMobileTab("call")}
            icon={<Phone className="h-5 w-5" />}
          />
          <TabButton
            active={mobileTab === "profile"}
            label="You"
            onClick={() => {
              setSettingsOpen(true);
              setMobileTab("profile");
            }}
            icon={<UserRound className="h-5 w-5" />}
          />
        </div>
      </nav>

      {mobileTab === "call" && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/20 p-6 backdrop-blur-md md:hidden">
          <div className="glass-panel max-w-sm p-6 text-center">
            <Phone className="mx-auto h-8 w-8 text-sky-600" />
            <p className="mt-3 font-display text-xl font-semibold">Voice calls</p>
            <p className="mt-2 text-sm text-slate-500">
              Open a conversation and tap the phone icon to start a call.
            </p>
            <button
              type="button"
              className="mt-4 text-sm font-medium text-sky-600"
              onClick={() => setMobileTab("chats")}
            >
              Back to chats
            </button>
          </div>
        </div>
      )}

      <CallOverlay />
      <AddUserDialog
        open={addUserOpen}
        onClose={() => setAddUserOpen(false)}
        onOpenConversation={selectConversation}
      />
      <CreateGroupDialog
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        onCreated={() => {
          /* Group chat UI threads land next; metadata is persisted. */
        }}
      />
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
  icon,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-0.5 text-[11px] font-medium",
        active ? "text-sky-600" : "text-slate-450 text-slate-500",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
