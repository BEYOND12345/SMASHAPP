import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TranscribeRequest {
  intake_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get JWT from authorization header
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { intake_id }: TranscribeRequest = await req.json();

    console.log("[TRANSCRIPT] Starting transcription", {
      intake_id,
      user_id: user.id,
      timestamp: new Date().toISOString(),
    });

    if (!intake_id) {
      console.error("[TRANSCRIPT] Missing intake_id");
      throw new Error("Missing intake_id");
    }

    // Fetch intake record
    const { data: intake, error: intakeError } = await supabase
      .from("voice_intakes")
      .select("*")
      .eq("id", intake_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (intakeError || !intake) {
      console.error("[TRANSCRIPT] Intake not found", {
        intake_id,
        error: intakeError?.message,
      });
      throw new Error("Voice intake not found or access denied");
    }

    console.log("[TRANSCRIPT] Intake loaded", {
      intake_id,
      status: intake.status,
      has_audio_path: !!intake.audio_storage_path,
    });

    if (intake.status !== "captured") {
      console.error("[TRANSCRIPT] Invalid status", {
        intake_id,
        status: intake.status,
      });
      throw new Error(`Voice intake already processed with status: ${intake.status}`);
    }

    // Download audio from storage
    console.log("[TRANSCRIPT] Downloading audio", {
      intake_id,
      storage_path: intake.audio_storage_path,
    });

    const { data: audioData, error: downloadError } = await supabase.storage
      .from("voice-intakes")
      .download(intake.audio_storage_path);

    if (downloadError || !audioData) {
      console.error("[TRANSCRIPT] Audio download failed", {
        intake_id,
        error: downloadError?.message,
      });
      throw new Error(`Failed to download audio: ${downloadError?.message}`);
    }

    const audioSizeBytes = audioData.size;
    console.log("[TRANSCRIPT] Audio downloaded", {
      intake_id,
      size_bytes: audioSizeBytes,
      size_kb: Math.round(audioSizeBytes / 1024),
    });

    // Convert Blob to File for OpenAI API
    const audioFile = new File([audioData], "audio.webm", { type: audioData.type });

    // Call OpenAI Transcription API via proxy
    console.log("[TRANSCRIPT] Calling OpenAI Whisper API", { intake_id });

    const formData = new FormData();
    formData.append("endpoint", "audio/transcriptions");
    formData.append("file", audioFile);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");

    const proxyUrl = `${supabaseUrl}/functions/v1/openai-proxy`;
    const transcriptionResponse = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Authorization": authHeader!,
      },
      body: formData,
    });

    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      console.error("[TRANSCRIPT] OpenAI API failed", {
        intake_id,
        status: transcriptionResponse.status,
        error: errorText,
      });
      throw new Error(`OpenAI transcription failed: ${errorText}`);
    }

    const transcriptionResult = await transcriptionResponse.json();
    const transcriptText = transcriptionResult.text || "";
    const transcriptLength = transcriptText.trim().length;
    const audioDuration = Math.round(transcriptionResult.duration || 0);

    console.log("[TRANSCRIPT] Transcription complete", {
      intake_id,
      transcript_length: transcriptLength,
      audio_duration_seconds: audioDuration,
      language: transcriptionResult.language || "en",
      has_content: transcriptLength > 0,
    });

    // CRITICAL: Validate transcript is not empty or useless
    if (transcriptLength === 0) {
      console.error("[TRANSCRIPT] CRITICAL: Empty transcript returned", {
        intake_id,
        audio_size_bytes: audioSizeBytes,
        audio_duration: audioDuration,
      });
      throw new Error("Transcription returned empty text. Audio may be silent or corrupted.");
    }

    // CRITICAL: Fail if transcript is suspiciously short for audio duration
    // Rule: If audio is > 3 seconds but transcript is < 10 characters, likely failed transcription
    if (audioDuration > 3 && transcriptLength < 10) {
      console.error("[TRANSCRIPT] CRITICAL: Transcript too short for audio duration", {
        intake_id,
        transcript_length: transcriptLength,
        audio_duration: audioDuration,
        transcript_preview: transcriptText,
      });
      throw new Error(`Transcription failed - only captured "${transcriptText}" from ${audioDuration} seconds of audio. Please try recording again and speak clearly.`);
    }

    // GUARD: Warn if transcript seems short but might be valid (e.g., "No thanks, goodbye")
    if (transcriptLength < 30 && audioDuration > 10) {
      console.warn("[TRANSCRIPT] WARNING: Short transcript for audio length", {
        intake_id,
        transcript_length: transcriptLength,
        audio_duration: audioDuration,
        transcript_preview: transcriptText,
      });
    }

    // Update intake with transcript
    console.log("[TRANSCRIPT] Saving transcript to database", { intake_id });

    const { error: updateError } = await supabase
      .from("voice_intakes")
      .update({
        transcript_text: transcriptText,
        transcript_model: "whisper-1",
        transcript_language: transcriptionResult.language || "en",
        audio_duration_seconds: audioDuration,
        status: "transcribed",
      })
      .eq("id", intake_id);

    if (updateError) {
      console.error("[TRANSCRIPT] Database update failed", {
        intake_id,
        error: updateError.message,
      });
      throw new Error(`Failed to update intake: ${updateError.message}`);
    }

    console.log("[TRANSCRIPT] ✓ Transcription pipeline complete", {
      intake_id,
      status: "transcribed",
    });

    return new Response(
      JSON.stringify({
        success: true,
        intake_id,
        transcript: transcriptText,
        language: transcriptionResult.language,
        duration: audioDuration,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[TRANSCRIPT] ✗ Pipeline failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});