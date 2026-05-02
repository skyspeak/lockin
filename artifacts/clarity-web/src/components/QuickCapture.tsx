import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Mic, MicOff, Send, Loader2 } from "lucide-react";
import { useCreateThought } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListThoughtsQueryKey, getGetThoughtsStatsQueryKey } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  content: z.string().min(1, "Thought cannot be empty"),
  category: z.enum(["work", "side-projects", "family", "finance", "personal", "health", "other"]),
});

type FormValues = z.infer<typeof formSchema>;

export function QuickCapture() {
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      content: "",
      category: "other",
    },
  });

  const createThought = useCreateThought();

  useEffect(() => {
    if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
      setSpeechSupported(true);
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentVal = form.getValues("content");
        if (finalTranscript) {
          form.setValue("content", currentVal ? `${currentVal} ${finalTranscript}` : finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsRecording(false);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }
  }, [form]);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsRecording(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const onSubmit = (data: FormValues) => {
    createThought.mutate({ data }, {
      onSuccess: () => {
        form.reset();
        toast({ title: "Thought captured" });
        queryClient.invalidateQueries({ queryKey: getListThoughtsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetThoughtsStatsQueryKey() });
      },
      onError: () => {
        toast({ title: "Failed to capture thought", variant: "destructive" });
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 bg-card p-6 rounded-xl border shadow-sm">
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="relative">
                  <Textarea
                    placeholder="What's on your mind?"
                    className="min-h-[120px] resize-none pb-12 text-lg leading-relaxed bg-transparent border-0 focus-visible:ring-0 px-0"
                    {...field}
                  />
                  <div className="absolute bottom-0 right-0 left-0 pt-4 flex items-center justify-between border-t border-border/50">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="w-[140px] h-8 text-xs border-0 bg-muted/50 hover:bg-muted text-muted-foreground focus:ring-0">
                                <SelectValue placeholder="Category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="work">Work</SelectItem>
                              <SelectItem value="side-projects">Side Projects</SelectItem>
                              <SelectItem value="family">Family</SelectItem>
                              <SelectItem value="finance">Finance</SelectItem>
                              <SelectItem value="personal">Personal</SelectItem>
                              <SelectItem value="health">Health</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    
                    <div className="flex items-center gap-2">
                      {speechSupported && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 rounded-full ${isRecording ? "text-destructive bg-destructive/10 hover:bg-destructive/20" : "text-muted-foreground hover:text-foreground"}`}
                          onClick={toggleRecording}
                        >
                          {isRecording ? <Mic className="h-4 w-4 animate-pulse" /> : <MicOff className="h-4 w-4" />}
                        </Button>
                      )}
                      <Button
                        type="submit"
                        size="sm"
                        className="rounded-full h-8 px-4"
                        disabled={createThought.isPending || !form.watch("content")}
                      >
                        {createThought.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                        Capture
                      </Button>
                    </div>
                  </div>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}