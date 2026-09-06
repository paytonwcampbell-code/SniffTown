import { useEffect, useRef, useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListConversations,
  useListMessages,
  useSendMessage,
  useMarkConversationRead,
  useGetCurrentUser,
  getListConversationsQueryKey,
  getListMessagesQueryKey,
} from "@workspace/api-client-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Send, ArrowLeft, MessageSquare, Inbox } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

const getInitials = (name?: string | null) => (name ? name.substring(0, 2).toUpperCase() : "U");

function formatMessageTime(dateString: string) {
  const date = new Date(dateString);
  if (isToday(date)) {
    return format(date, "h:mm a");
  } else if (isYesterday(date)) {
    return "Yesterday";
  } else {
    return format(date, "MMM d");
  }
}

export default function Messages() {
  const [location, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const queryC = searchParams.get("c");
  const queryTo = searchParams.get("to");
  
  const { data: user, isLoading: isUserLoading } = useGetCurrentUser();
  const { data: conversations, isLoading: isConversationsLoading } = useListConversations({
    query: {
      refetchInterval: 5000,
      queryKey: getListConversationsQueryKey(),
    }
  });
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Authentication check
  useEffect(() => {
    if (!isUserLoading && !user?.id) {
      setLocation("/auth");
    }
  }, [user, isUserLoading, setLocation]);

  // Find existing conversation for `to` param
  useEffect(() => {
    if (conversations && queryTo && !queryC) {
      const existing = conversations.find(c => c.otherUserId === queryTo);
      if (existing) {
        setLocation(`/messages?c=${existing.id}`);
      }
    }
  }, [conversations, queryTo, queryC, setLocation]);

  // Selected conversation state
  const selectedConversation = conversations?.find(c => c.id === queryC);
  
  const selectedConversationRef = useRef(selectedConversation);
  selectedConversationRef.current = selectedConversation;
  
  // Mark read mutation
  const markRead = useMarkConversationRead({
    mutation: {
      onSuccess: () => {
        const sc = selectedConversationRef.current;
        if (sc) {
          queryClient.setQueryData(getListConversationsQueryKey(), (old: any) => {
            if (!Array.isArray(old)) return old;
            return old.map(c => c.id === sc.id ? { ...c, unreadCount: 0 } : c);
          });
        }
      }
    }
  });

  const markReadMutateRef = useRef(markRead.mutate);
  markReadMutateRef.current = markRead.mutate;

  // Auto-mark read when opening conversation with unreads
  useEffect(() => {
    if (selectedConversation && selectedConversation.unreadCount > 0) {
      markReadMutateRef.current({ conversationId: selectedConversation.id });
    }
  }, [selectedConversation?.id, selectedConversation?.unreadCount]);

  // Messages for selected conversation
  const { data: messages, isLoading: isMessagesLoading } = useListMessages(queryC as string, {
    query: {
      enabled: !!queryC,
      refetchInterval: 5000,
      queryKey: getListMessagesQueryKey(queryC as string),
    }
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Send message mutation
  const sendMessage = useSendMessage({
    mutation: {
      onSuccess: (data) => {
        setMessageText("");
        
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        if (queryC) {
          queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(queryC) });
        } else {
          setLocation(`/messages?c=${data.conversationId}`);
        }
      },
      onError: () => {
        toast({ title: "Failed to send message", variant: "destructive" });
      }
    }
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    
    let receiverId = "";
    if (selectedConversation) {
      receiverId = selectedConversation.otherUserId || "";
    } else if (queryTo) {
      receiverId = queryTo;
    }
    
    if (!receiverId) return;

    sendMessage.mutate({
      data: {
        receiverId,
        content: messageText.trim()
      }
    });
  };

  if (isUserLoading || !user?.id) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-pulse font-display text-muted-foreground">Loading...</div></div>;
  }

  const showList = !queryC && !queryTo;

  return (
    <div className="container mx-auto max-w-6xl px-0 sm:px-4 py-0 sm:py-6 h-[calc(100dvh-4rem)]">
      <Card className="h-full flex flex-col md:flex-row overflow-hidden border-border/40 shadow-sm rounded-none sm:rounded-xl">
        
        {/* Sidebar */}
        <div className={`w-full md:w-80 lg:w-96 border-r border-border/40 bg-secondary/10 flex-col h-full ${!showList ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-border/40 bg-background/50 backdrop-blur-sm">
            <h1 className="font-display text-2xl font-bold flex items-center gap-2">
              <Inbox className="h-5 w-5 text-primary" /> Inbox
            </h1>
          </div>
          
          <ScrollArea className="flex-1">
            {isConversationsLoading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-xl animate-pulse bg-muted/30" />
                ))}
              </div>
            ) : conversations?.length === 0 && !queryTo ? (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                <MessageSquare className="h-10 w-10 mb-3 opacity-20" />
                <p>No messages yet.</p>
                <p className="text-sm mt-1">Connect with neighbors on the explore page.</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {queryTo && !selectedConversation && (
                  <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-3 cursor-pointer">
                    <Avatar className="h-12 w-12 border border-primary/20">
                      <AvatarFallback className="bg-primary/20 text-primary font-display font-medium">NEW</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <h3 className="font-semibold text-foreground truncate">New Message</h3>
                      <p className="text-sm text-muted-foreground truncate">Drafting...</p>
                    </div>
                  </div>
                )}
                
                {conversations?.map((conv) => (
                  <Button
                    key={conv.id}
                    variant="ghost"
                    className={`w-full justify-start h-auto p-3 rounded-xl transition-all ${
                      queryC === conv.id 
                        ? 'bg-primary/10 hover:bg-primary/15' 
                        : 'hover:bg-secondary/50'
                    }`}
                    onClick={() => setLocation(`/messages?c=${conv.id}`)}
                  >
                    <div className="flex items-center gap-3 w-full relative">
                      <Avatar className="h-12 w-12 border border-border/50 shrink-0">
                        <AvatarImage src={conv.otherDogPhotoUrl || ""} className="object-cover" />
                        <AvatarFallback className="bg-secondary text-secondary-foreground font-display font-medium">
                          {getInitials(conv.otherOwnerName || conv.otherDogName)}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <h3 className="font-semibold text-foreground truncate max-w-[120px]">
                            {conv.otherOwnerName || "Neighbor"}
                          </h3>
                          {conv.lastMessageAt && (
                            <span className="text-xs text-muted-foreground shrink-0 ml-2">
                              {formatMessageTime(conv.lastMessageAt)}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex justify-between items-center gap-2">
                          <p className={`text-sm truncate flex-1 ${conv.unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                            {conv.lastMessage || "Started a conversation"}
                          </p>
                          {conv.unreadCount > 0 && (
                            <span className="bg-primary text-primary-foreground text-[10px] font-bold h-5 min-w-[20px] px-1.5 rounded-full flex items-center justify-center shrink-0">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                        {conv.otherDogName && (
                          <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                            with {conv.otherDogName}
                          </p>
                        )}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Main Area */}
        <div className={`flex-1 flex-col h-full bg-background ${showList ? 'hidden md:flex' : 'flex'}`}>
          {!queryC && !queryTo ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground p-6">
              <div className="text-center max-w-sm">
                <div className="h-16 w-16 bg-secondary/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h2 className="font-display text-xl font-medium text-foreground mb-2">Select a conversation</h2>
                <p>Choose an existing chat from the sidebar or start a new one from a dog's profile.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="p-3 sm:p-4 border-b border-border/40 bg-background/95 backdrop-blur flex items-center gap-3 shrink-0">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="md:hidden shrink-0 -ml-2" 
                  onClick={() => setLocation("/messages")}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                
                <Avatar className="h-10 w-10 border border-primary/20 shrink-0">
                  <AvatarImage src={selectedConversation?.otherDogPhotoUrl || ""} className="object-cover" />
                  <AvatarFallback className="bg-secondary text-secondary-foreground font-display text-sm">
                    {getInitials(selectedConversation?.otherOwnerName || selectedConversation?.otherDogName)}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-foreground truncate leading-tight">
                    {selectedConversation?.otherOwnerName || (queryTo ? "New Message" : "Neighbor")}
                  </h2>
                  {selectedConversation?.otherDogName && (
                    <p className="text-xs text-muted-foreground truncate">
                      with {selectedConversation.otherDogName}
                    </p>
                  )}
                </div>
              </div>

              {/* Chat Messages */}
              <ScrollArea className="flex-1 p-4 bg-muted/10">
                <div className="max-w-3xl mx-auto space-y-4 pb-4">
                  {isMessagesLoading ? (
                    <div className="space-y-4 flex flex-col">
                      <div className="w-2/3 h-16 bg-muted/40 rounded-2xl rounded-tl-sm animate-pulse self-start" />
                      <div className="w-1/2 h-12 bg-primary/10 rounded-2xl rounded-tr-sm animate-pulse self-end" />
                    </div>
                  ) : messages?.length === 0 ? (
                    <div className="text-center text-muted-foreground py-10">
                      <p>This is the start of your conversation.</p>
                      <p className="text-sm mt-1">Say hello and set up a playdate!</p>
                    </div>
                  ) : (
                    messages?.map((msg, idx) => {
                      const isMe = msg.senderId === user.id;
                      const showAvatar = !isMe && (idx === messages.length - 1 || messages[idx + 1].senderId === user.id);
                      
                      return (
                        <div key={msg.id} className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          {!isMe && (
                            <div className="w-8 shrink-0 flex items-end">
                              {showAvatar && (
                                <Avatar className="h-8 w-8 border border-border/50">
                                  <AvatarImage src={selectedConversation?.otherDogPhotoUrl || ""} className="object-cover" />
                                  <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-display">
                                    {getInitials(selectedConversation?.otherOwnerName || selectedConversation?.otherDogName)}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                            </div>
                          )}
                          
                          <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                            <div 
                              className={`px-4 py-2.5 shadow-sm text-sm sm:text-base ${
                                isMe 
                                  ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm' 
                                  : 'bg-card border border-border/40 text-card-foreground rounded-2xl rounded-tl-sm'
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            </div>
                            <span className="text-[10px] text-muted-foreground mt-1 mx-1">
                              {format(new Date(msg.createdAt), "h:mm a")}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Compose */}
              <div className="p-3 sm:p-4 bg-background border-t border-border/40 shrink-0">
                <form 
                  onSubmit={handleSend}
                  className="max-w-3xl mx-auto flex items-end gap-2 bg-secondary/20 p-1.5 rounded-3xl border border-border/50 focus-within:border-primary/50 focus-within:bg-background transition-colors"
                >
                  <Textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Message your neighbor..."
                    className="flex-1 min-h-[44px] max-h-32 resize-none bg-transparent border-0 focus-visible:ring-0 shadow-none py-3 px-4 text-base"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e);
                      }
                    }}
                  />
                  <Button 
                    type="submit" 
                    size="icon" 
                    className="h-11 w-11 rounded-full shrink-0 mb-0.5 mr-0.5 shadow-sm"
                    disabled={sendMessage.isPending || !messageText.trim()}
                  >
                    <Send className="h-5 w-5 ml-0.5" />
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
