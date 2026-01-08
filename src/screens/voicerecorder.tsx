import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface VoiceRecorderProps {
  onBack: () => void;
  onQuoteCreated?: (quoteId: string) => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onBack, onQuoteCreated }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const [checklistItems, setChecklistItems] = useState([
    { id: 1, label: 'Job address', status: 'waiting' },
    { id: 2, label: 'Customer name', status: 'waiting' },
    { id: 3, label: 'Scope of work', status: 'waiting' },
    { id: 4, label: 'Materials needed', status: 'waiting' },
    { id: 5, label: 'Time to complete', status: 'waiting' },
    { id: 6, label: 'Additional charges', status: 'waiting' }
  ]);

  const [currentVoiceQuoteId, setCurrentVoiceQuoteId] = useState<string | null>(null);
  const [createdQuoteId, setCreatedQuoteId] = useState<string | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const detectionTimeoutsRef = useRef<Map<string, number>>(new Map());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isStoppingRef = useRef(false);
  const speechRecognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    console.log('[VERIFICATION] Old polling system removed - only useEffect polling remains');
  }, []);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      detectionTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Count required items (items 1-5) - item 6 (Additional charges) is optional
    const requiredItems = checklistItems.filter(item => item.id <= 5);
    const requiredComplete = requiredItems.every(item => item.status === 'complete');
    const allComplete = checklistItems.every(item => item.status === 'complete');
    const completeCount = checklistItems.filter(item => item.status === 'complete').length;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c587d41-3a78-459c-ae6c-5ce52087404d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voicerecorder.tsx:57',message:'Navigation check',data:{allComplete,requiredComplete,completeCount,total:checklistItems.length,requiredCount:requiredItems.length,hasVoiceQuoteId:!!currentVoiceQuoteId,hasCreatedQuoteId:!!createdQuoteId,statuses:checklistItems.map(i=>`${i.label}:${i.status}`)},timestamp:Date.now(),sessionId:'debug-session',runId:'run5',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    console.log('[VoiceRecorder] Navigation check - requiredComplete:', requiredComplete, 'allComplete:', allComplete, 'completeCount:', completeCount, 'total:', checklistItems.length, 'currentVoiceQuoteId:', currentVoiceQuoteId, 'createdQuoteId:', createdQuoteId);
    console.log('[VoiceRecorder] Checklist statuses:', checklistItems.map(item => `${item.label}: ${item.status}`));

    // Navigate once quote is created, regardless of checklist completion
    // The checklist is for real-time feedback, but once the quote is created, we should navigate
    // This allows navigation even if some optional items (materials, labor hours) weren't detected
    if (createdQuoteId) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c587d41-3a78-459c-ae6c-5ce52087404d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voicerecorder.tsx:61',message:'Navigation triggered',data:{voiceQuoteId:currentVoiceQuoteId,createdQuoteId:createdQuoteId,requiredComplete,allComplete},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      console.log('[VoiceRecorder] Quote created, navigating to quote:', createdQuoteId);
      stopPolling();

      setTimeout(() => {
        // Use callback for internal navigation instead of window.location.href
        // This avoids triggering the public router and keeps us in the app
        if (onQuoteCreated) {
          console.log('[VoiceRecorder] Calling onQuoteCreated callback with:', createdQuoteId);
          onQuoteCreated(createdQuoteId);
        } else {
          console.log('[VoiceRecorder] No onQuoteCreated callback, falling back to onBack');
          onBack();
        }
      }, 1000);
    } else if ((requiredComplete || allComplete) && currentVoiceQuoteId && !createdQuoteId) {
      // Checklist complete but quote not created yet - log for debugging
      console.log('[VoiceRecorder] Checklist complete but quote not created yet. Waiting for quote creation...', {
        voiceQuoteId: currentVoiceQuoteId,
        createdQuoteId: createdQuoteId
      });
    }
  }, [checklistItems, currentVoiceQuoteId, createdQuoteId]);

  // Real-time keyword detection for checklist items with context requirements
  const detectKeywordsInSpeech = (transcript: string, isFinal: boolean = false) => {
    const lowerTranscript = transcript.toLowerCase();
    
    // Patterns that require actual data, not just keywords
    // Format: [pattern, requiresContext]
    const keywordPatterns = {
      1: [
        // High confidence - has actual location data
        { pattern: /(?:job\s+)?(?:address|location)\s+is\s+([a-z0-9\s,]+)/i, requiresContext: true },
        { pattern: /(?:at|in)\s+([a-z0-9\s,]+(?:street|road|avenue|place|beach|bay|sydney|melbourne|brisbane))/i, requiresContext: true },
        { pattern: /\b([a-z0-9\s]+(?:street|road|avenue|place|beach|bay))\b/i, requiresContext: true },
        // Lower confidence - just mentions keyword
        { pattern: /\b(?:job\s+)?(?:address|location)\b/i, requiresContext: false }
      ],
      2: [
        // High confidence - has actual name
        { pattern: /(?:customer|client)\s+name\s+is\s+([a-z\s]+)/i, requiresContext: true },
        { pattern: /(?:quote|for)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i, requiresContext: true },
        { pattern: /\b(?:customer|client)\s+is\s+([a-z\s]+)/i, requiresContext: true },
        // Lower confidence
        { pattern: /\b(?:customer|client)\s+name\b/i, requiresContext: false }
      ],
      3: [
        // High confidence - has actual work description
        { pattern: /(?:scope|work|job|task|project)\s+(?:is|to)\s+([a-z\s]+(?:build|repair|replace|install|remove|deck|door|windows|house))/i, requiresContext: true },
        { pattern: /(?:building|rebuilding|repairing|replacing|installing|removing)\s+([a-z\s]+)/i, requiresContext: true },
        { pattern: /\b(?:build|repair|replace|install|remove)\s+([a-z\s]+)/i, requiresContext: true },
        // Lower confidence
        { pattern: /\b(?:scope\s+of\s+work|scope|work|job|task|project)\b/i, requiresContext: false }
      ],
      4: [
        // High confidence - has actual materials
        { pattern: /(?:materials|material|supplies)\s+(?:are|needed|need)\s+([a-z0-9\s,]+(?:plywood|screws|nails|wood|concrete|paint|sheets|bags))/i, requiresContext: true },
        { pattern: /(?:need|needed)\s+([0-9]+\s+(?:sheets|bags|pieces)\s+of\s+[a-z]+)/i, requiresContext: true },
        { pattern: /\b([0-9]+\s+(?:sheets|bags)\s+of\s+(?:plywood|screws|nails|wood|concrete|paint))/i, requiresContext: true },
        // Lower confidence
        { pattern: /\b(?:materials|material|supplies)\b/i, requiresContext: false }
      ],
      5: [
        // High confidence - has actual time
        { pattern: /(?:time|will\s+take|takes)\s+(?:is|to\s+complete|is)\s+([0-9]+\s+(?:hours|days|minutes))/i, requiresContext: true },
        { pattern: /(?:will\s+take|takes)\s+([0-9]+\s+(?:hours|days))/i, requiresContext: true },
        { pattern: /\b([0-9]+\s+(?:hours|days))\b/i, requiresContext: true },
        // Lower confidence
        { pattern: /\b(?:time\s+to\s+complete|time|hours|days|duration|labor)\b/i, requiresContext: false }
      ],
      6: [
        // High confidence - has actual charges
        { pattern: /(?:additional\s+)?(?:charges|fee|fees)\s+(?:are|is|for)\s+([a-z\s]+(?:travel|delivery|extra|cost|price))/i, requiresContext: true },
        { pattern: /(?:travel|delivery)\s+(?:fee|charge|cost)/i, requiresContext: true },
        // Lower confidence
        { pattern: /\b(?:additional\s+charges|charges|fee|fees|extra|cost|price|travel|delivery)\b/i, requiresContext: false }
      ]
    };
    
    setChecklistItems(prev => {
      return prev.map(item => {
        // Skip if already complete
        if (item.status === 'complete') return item;
        
        const patterns = keywordPatterns[item.id as keyof typeof keywordPatterns] || [];
        
        // Check patterns - prefer high confidence matches
        let highConfidenceMatch = false;
        let lowConfidenceMatch = false;
        
        for (const patternObj of patterns) {
          const match = lowerTranscript.match(patternObj.pattern);
          if (match) {
            if (patternObj.requiresContext) {
              // High confidence - has actual data
              if (match[1] && match[1].trim().length > 2) {
                highConfidenceMatch = true;
                break;
              }
            } else {
              // Low confidence - just keyword
              lowConfidenceMatch = true;
            }
          }
        }
        
        // Only mark complete if:
        // 1. High confidence match (has actual data), OR
        // 2. Low confidence match AND it's a final transcript (not interim)
        if (highConfidenceMatch || (lowConfidenceMatch && isFinal)) {
          console.log(`[VoiceRecorder] ✓ Real-time detection: "${item.label}" - confidence: ${highConfidenceMatch ? 'high' : 'low'}`);
          return { ...item, status: 'complete' };
        }
        
        return item;
      });
    });
  };

  // Helper function to update checklist based on quote_data
  const updateChecklistFromQuoteData = (qd: any) => {
    console.log('[VoiceRecorder] FULL quote_data structure:', JSON.stringify(qd, null, 2));
    console.log('[VoiceRecorder] Field checks:', {
      jobLocation: !!qd.jobLocation,
      customerName: !!qd.customerName,
      jobTitle: !!qd.jobTitle,
      materials: !!qd.materials?.length,
      laborHours: !!qd.laborHours,
      fees: !!qd.fees,
      feesType: typeof qd.fees,
      feesIsArray: Array.isArray(qd.fees)
    });
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1c587d41-3a78-459c-ae6c-5ce52087404d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voicerecorder.tsx:102',message:'Quote data received',data:{hasJobLocation:!!qd.jobLocation,hasCustomerName:!!qd.customerName,hasJobTitle:!!qd.jobTitle,hasMaterials:!!qd.materials?.length,hasLaborHours:!!qd.laborHours,hasFees:!!qd.fees,quoteDataKeys:Object.keys(qd),fullQuoteData:qd},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    setChecklistItems(prev => {
      console.log('[VoiceRecorder] Current checklist before update:', prev.map(i => `${i.id}:${i.label}:${i.status}`));
      const updated = prev.map(item => {
        // Skip items that are already complete
        if (item.status === 'complete') return item;
        
        // If item is detecting, mark as complete (timeout logic removed for testing)
        if (item.status === 'detecting') {
          console.log('[VoiceRecorder] Item was detecting, marking complete:', item.label);
          return { ...item, status: 'complete' };
        }
        
        let shouldDetect = false;
        let detectionReason = '';
        if (item.id === 1 && qd.jobLocation) {
          shouldDetect = true;
          detectionReason = 'jobLocation exists';
        }
        if (item.id === 2 && qd.customerName) {
          shouldDetect = true;
          detectionReason = 'customerName exists';
        }
        if (item.id === 3 && qd.jobTitle) {
          shouldDetect = true;
          detectionReason = 'jobTitle exists';
        }
        if (item.id === 4 && qd.materials?.length > 0) {
          shouldDetect = true;
          detectionReason = 'materials array has items';
        }
        if (item.id === 5 && qd.laborHours) {
          shouldDetect = true;
          detectionReason = 'laborHours exists';
        }
        // Note: fees field is not in extraction prompt, so it's optional
        // If fees exists and has data, detect it. Otherwise, mark as complete anyway (optional field)
        if (item.id === 6) {
          if (qd.fees && (Array.isArray(qd.fees) ? qd.fees.length > 0 : Object.keys(qd.fees).length > 0)) {
            shouldDetect = true;
            detectionReason = 'fees exists';
          } else {
            // Fees not in data (not in extraction prompt), mark as complete since it's optional
            console.log('[VoiceRecorder] Item 6 (Additional charges) - fees not in data (optional field), marking complete');
            shouldDetect = true;
            detectionReason = 'fees optional - not required';
          }
        }
      
        if (shouldDetect && item.status === 'waiting') {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/1c587d41-3a78-459c-ae6c-5ce52087404d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voicerecorder.tsx:116',message:'Item detected - marking complete immediately',data:{itemId:item.id,itemLabel:item.label,previousStatus:item.status,detectionReason},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          console.log('[VoiceRecorder] ✓ Detected data for:', item.label, '- reason:', detectionReason, '- marking complete immediately');
          // Clear any existing timeout for this item
          const existingTimeout = detectionTimeoutsRef.current.get(`item-${item.id}`);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
            detectionTimeoutsRef.current.delete(`item-${item.id}`);
          }
          // Mark as complete immediately (removed delay to test if timeout was the issue)
          return { ...item, status: 'complete' };
        } else if (item.status === 'waiting') {
          console.log('[VoiceRecorder] ✗ Item NOT detected:', item.label, 'shouldDetect:', shouldDetect);
        }
        return item;
      });
      console.log('[VoiceRecorder] Checklist after update:', updated.map(i => `${i.id}:${i.label}:${i.status}`));
      return updated;
    });
  };

  // New polling useEffect - polls for quote_data and updates checklist
  useEffect(() => {
    if (!currentVoiceQuoteId) return;
    
    const startTime = Date.now();
    // Use ref to persist timeouts across re-renders
    const detectionTimeouts = detectionTimeoutsRef.current;
    
    const pollInterval = window.setInterval(async () => {
      const elapsed = Date.now() - startTime;
      
      // Stop after 60 seconds
      if (elapsed > 60000) {
        console.log('[VoiceRecorder] Polling timeout reached (60s)');
        clearInterval(pollInterval);
        pollingIntervalRef.current = null;
        return;
      }
      
      const { data, error } = await supabase
        .from('voice_quotes')
        .select('quote_data, status')
        .eq('id', currentVoiceQuoteId)
        .single();
      
      if (error) {
        console.error('[VoiceRecorder] Polling error:', error);
        return;
      }
      
      console.log('POLLING RESULT:', data);

      // Update checklist items when quote_data is found
      if (data && data.quote_data) {
        updateChecklistFromQuoteData(data.quote_data);
      } else {
        console.log('[VoiceRecorder] No quote_data found in polling result, status:', data?.status);
      }
    }, 2000);
    
    // Store interval reference so navigation check can work
    pollingIntervalRef.current = pollInterval;
    
    return () => {
      console.log('[VoiceRecorder] Cleanup: clearing interval and timeouts');
      clearInterval(pollInterval);
      pollingIntervalRef.current = null;
      // Clear all pending detection timeouts
      const timeoutCount = detectionTimeouts.size;
      detectionTimeouts.forEach(timeout => clearTimeout(timeout));
      detectionTimeouts.clear();
      console.log('[VoiceRecorder] Cleanup: cleared', timeoutCount, 'timeouts');
    };
  }, [currentVoiceQuoteId]);

  const startRecording = async () => {
    try {
      console.log('[VoiceRecorder] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });
      streamRef.current = stream;
      console.log('[VoiceRecorder] Microphone access granted');

      audioChunksRef.current = [];
      isStoppingRef.current = false;
      
      // Reset checklist items for new recording
      setChecklistItems([
        { id: 1, label: 'Job address', status: 'waiting' },
        { id: 2, label: 'Customer name', status: 'waiting' },
        { id: 3, label: 'Scope of work', status: 'waiting' },
        { id: 4, label: 'Materials needed', status: 'waiting' },
        { id: 5, label: 'Time to complete', status: 'waiting' },
        { id: 6, label: 'Additional charges', status: 'waiting' }
      ]);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      console.log('[VoiceRecorder] Using MIME type:', mimeType || 'default');

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        console.log('[VoiceRecorder] Data available:', event.data.size, 'bytes');
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstart = () => {
        console.log('[VoiceRecorder] Recording started');
        
        // Start real-time speech recognition for checklist updates
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
          const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
          const recognition = new SpeechRecognition();
          
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';
          
          recognition.onresult = (event: any) => {
            let interimTranscript = '';
            let finalTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
              } else {
                interimTranscript += transcript;
              }
            }
            
            // Prioritize final transcripts for accuracy
            // Only use interim for high-confidence matches
            if (finalTranscript.trim()) {
              console.log('[VoiceRecorder] Final speech detected:', finalTranscript.trim());
              detectKeywordsInSpeech(finalTranscript.trim(), true);
            } else if (interimTranscript.trim()) {
              // For interim results, only check for high-confidence patterns
              console.log('[VoiceRecorder] Interim speech detected:', interimTranscript.trim());
              detectKeywordsInSpeech(interimTranscript.trim(), false);
            }
          };
          
          recognition.onerror = (event: any) => {
            console.warn('[VoiceRecorder] Speech recognition error:', event.error);
            // Don't stop recording if speech recognition fails
          };
          
          recognition.onend = () => {
            // Restart recognition if still recording
            if (isRecordingRef.current && !isStoppingRef.current) {
              try {
                recognition.start();
              } catch (e) {
                console.warn('[VoiceRecorder] Could not restart speech recognition:', e);
              }
            }
          };
          
          try {
            recognition.start();
            speechRecognitionRef.current = recognition;
            console.log('[VoiceRecorder] Real-time speech recognition started');
          } catch (e) {
            console.warn('[VoiceRecorder] Could not start speech recognition:', e);
          }
        } else {
          console.warn('[VoiceRecorder] Speech recognition not supported in this browser');
        }
      };

      recorder.onstop = async () => {
        console.log('[VoiceRecorder] Recording stopped, total chunks:', audioChunksRef.current.length);

        if (isStoppingRef.current) {
          return;
        }
        isStoppingRef.current = true;

        if (audioChunksRef.current.length === 0) {
          console.error('[VoiceRecorder] No audio data captured');
          alert('No audio was captured. Please try again.');
          setIsRecording(false);
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
          }
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        console.log('[VoiceRecorder] Created audio blob:', audioBlob.size, 'bytes');

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }

        await uploadAudio(audioBlob);
      };

      recorder.onerror = (event: any) => {
        console.error('[VoiceRecorder] Recorder error:', event.error);
        alert('Recording error: ' + event.error);
      };

      recorder.start(1000);
      console.log('[VoiceRecorder] Recorder.start() called with 1000ms timeslice');

      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordingTime(0);

      const startTime = Date.now();
      timerIntervalRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingTime(elapsed);

        if (elapsed >= 60) {
          console.log('[VoiceRecorder] Max time reached, stopping...');
          stopRecording();
        }
      }, 1000);

    } catch (error) {
      console.error('[VoiceRecorder] Error starting recording:', error);
      alert('Could not access microphone. Please check permissions and try again.');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    console.log('[VoiceRecorder] stopRecording called');

    // Stop speech recognition
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current = null;
        console.log('[VoiceRecorder] Speech recognition stopped');
      } catch (e) {
        console.warn('[VoiceRecorder] Error stopping speech recognition:', e);
      }
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    isRecordingRef.current = false;
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      console.log('[VoiceRecorder] Stopping MediaRecorder');
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadAudio = async (audioBlob: Blob) => {
    setIsUploading(true);
    console.log('[VoiceRecorder] Starting upload, blob size:', audioBlob.size);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      console.log('[VoiceRecorder] User ID:', user.id);

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();

      if (userError) {
        console.error('[VoiceRecorder] User query error:', userError);
        throw new Error('Failed to get user organization: ' + userError.message);
      }

      if (!userData) {
        throw new Error('User organization not found');
      }

      const orgId = userData.org_id;
      console.log('[VoiceRecorder] Org ID:', orgId);

      const fileName = `${crypto.randomUUID()}.webm`;
      const filePath = `${orgId}/${fileName}`;
      console.log('[VoiceRecorder] Upload path:', filePath);

      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(filePath, audioBlob, {
          contentType: audioBlob.type || 'audio/webm',
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('[VoiceRecorder] Upload error:', uploadError);
        throw uploadError;
      }

      console.log('[VoiceRecorder] Upload successful');

      const { data: { publicUrl } } = supabase.storage
        .from('audio')
        .getPublicUrl(filePath);

      console.log('[VoiceRecorder] Public URL:', publicUrl);

      await saveToDatabase(publicUrl, orgId);

      setUploadSuccess(true);

      setTimeout(() => {
        onBack();
      }, 1500);

    } catch (error: any) {
      console.error('[VoiceRecorder] Upload failed:', error);
      alert('Failed to upload recording: ' + (error.message || 'Unknown error'));
      setIsUploading(false);
      setIsRecording(false);
    }
  };

  const saveToDatabase = async (audioUrl: string, orgId: string) => {
    try {
      console.log('[VoiceRecorder] Saving to database:', { audioUrl, orgId });

      const { data, error } = await supabase
        .from('voice_quotes')
        .insert({
          org_id: orgId,
          audio_url: audioUrl,
          status: 'recorded'
        })
        .select()
        .single();

      if (error) {
        console.error('[VoiceRecorder] Database insert error:', error);
        throw error;
      }

      console.log('[VoiceRecorder] Recording saved to database:', data);

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1c587d41-3a78-459c-ae6c-5ce52087404d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voicerecorder.tsx:355',message:'Setting voice quote ID',data:{voiceQuoteId:data.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      setCurrentVoiceQuoteId(data.id);
      // Removed - using useEffect polling instead
      // startPolling(data.id);

      await processRecording(data.id, audioUrl);
    } catch (error) {
      console.error('[VoiceRecorder] Database save failed:', error);
      throw error;
    }
  };

  const processRecording = async (voiceQuoteId: string, audioUrl: string) => {
    try {
      console.log('[VoiceRecorder] Starting transcription for:', voiceQuoteId);

      await supabase
        .from('voice_quotes')
        .update({ status: 'transcribing' })
        .eq('id', voiceQuoteId);

      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio: ${audioResponse.status} ${audioResponse.statusText}`);
      }
      const audioBlob = await audioResponse.blob();

      const formData = new FormData();
      formData.append('endpoint', 'audio/transcriptions');
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const openaiProxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-proxy`;
      console.log('[VoiceRecorder] Calling OpenAI proxy:', openaiProxyUrl);

      const transcriptionResponse = await fetch(openaiProxyUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text().catch(() => 'Unknown error');
        throw new Error(`Transcription failed: ${transcriptionResponse.status} ${transcriptionResponse.statusText} - ${errorText}`);
      }

      const transcriptionData = await transcriptionResponse.json();
      const transcript = transcriptionData.text;

      if (!transcript) {
        throw new Error('Transcription returned empty text');
      }

      console.log('[VoiceRecorder] Transcript:', transcript);

      await supabase
        .from('voice_quotes')
        .update({
          status: 'transcribed',
          transcript: transcript
        })
        .eq('id', voiceQuoteId);

      await extractQuoteData(voiceQuoteId, transcript);

    } catch (error: any) {
      console.error('[VoiceRecorder] Processing failed:', error);
      const errorMessage = error?.message || String(error);
      console.error('[VoiceRecorder] Error details:', { 
        message: errorMessage, 
        stack: error?.stack,
        voiceQuoteId 
      });
      
      // Update status to failed, but don't block navigation
      try {
        const { error: updateError } = await supabase
          .from('voice_quotes')
          .update({ status: 'failed' })
          .eq('id', voiceQuoteId);
        
        if (updateError) {
          console.error('[VoiceRecorder] Failed to update status:', updateError);
        } else {
          console.log('[VoiceRecorder] Updated voice quote status to failed');
        }
      } catch (updateError: any) {
        console.error('[VoiceRecorder] Failed to update status:', updateError);
      }
    }
  };

  const extractQuoteData = async (voiceQuoteId: string, transcript: string) => {
    try {
      console.log('[VoiceRecorder] Extracting quote data...');

      await supabase
        .from('voice_quotes')
        .update({ status: 'extracting' })
        .eq('id', voiceQuoteId);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const extractionResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-proxy`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            endpoint: 'chat/completions',
            body: {
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: 'You are a helpful assistant that extracts structured quote information from voice transcripts. Extract all available information including customer name, job title/description, job location/address, materials with quantities, and labor hours. If a field is not mentioned, use null. Return JSON only.'
                },
                {
                  role: 'user',
                  content: `Extract quote information from this transcript:\n\n${transcript}\n\nReturn JSON with this exact structure:\n{\n  "customerName": "string or null",\n  "jobTitle": "string or null (brief description of the work)",\n  "jobLocation": "string or null (address or location)",\n  "materials": [{"name": "string", "quantity": number, "unit": "string"}],\n  "laborHours": number or null\n}`
                }
              ],
              response_format: { type: 'json_object' }
            }
          }),
        }
      );

      if (!extractionResponse.ok) {
        throw new Error('Extraction failed');
      }

      const extractionData = await extractionResponse.json();
      const quoteData = JSON.parse(extractionData.choices[0].message.content);

      console.log('[VoiceRecorder] Extracted data:', quoteData);

      // Update database with extracted data
      const { error: updateError } = await supabase
        .from('voice_quotes')
        .update({ 
          quote_data: quoteData,
          status: 'extracted'
        })
        .eq('id', voiceQuoteId);

      if (updateError) {
        console.error('[VoiceRecorder] Failed to update quote_data:', updateError);
      } else {
        console.log('[VoiceRecorder] Successfully updated quote_data in database');
        // Immediately update checklist with extracted data
        updateChecklistFromQuoteData(quoteData);
        
        // Create the actual quote from extracted data
        await createQuoteFromVoiceData(voiceQuoteId, quoteData);
      }

    } catch (error) {
      console.error('[VoiceRecorder] Extraction failed:', error);
      await supabase
        .from('voice_quotes')
        .update({ status: 'failed' })
        .eq('id', voiceQuoteId);
    }
  };

  const createQuoteFromVoiceData = async (voiceQuoteId: string, quoteData: any) => {
    try {
      console.log('[VoiceRecorder] Creating quote from extracted data...');
      
      // Get the voice_quote record to get org_id
      const { data: voiceQuote, error: voiceQuoteError } = await supabase
        .from('voice_quotes')
        .select('org_id, customer_id')
        .eq('id', voiceQuoteId)
        .single();

      if (voiceQuoteError || !voiceQuote) {
        throw new Error('Failed to fetch voice quote: ' + voiceQuoteError?.message);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      // Call create-draft-quote edge function
      // First, we need to create a voice_intake record for the edge function to work
      // Or we can create the quote directly from voice_quotes data
      
      // For now, let's create the quote directly using the extracted data
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Create or find customer (required - quotes table has NOT NULL constraint)
      let customerId = voiceQuote.customer_id;
      
      if (!customerId) {
        if (quoteData.customerName) {
          // Try to find existing customer by name
          const { data: existingCustomer } = await supabase
            .from('customers')
            .select('id')
            .eq('org_id', voiceQuote.org_id)
            .ilike('name', quoteData.customerName)
            .maybeSingle();

          if (existingCustomer) {
            customerId = existingCustomer.id;
          } else {
            // Create new customer with extracted name
            const { data: newCustomer, error: customerError } = await supabase
              .from('customers')
              .insert({
                org_id: voiceQuote.org_id,
                name: quoteData.customerName,
                created_by_user_id: user.id
              })
              .select()
              .single();

            if (customerError || !newCustomer) {
              throw new Error('Failed to create customer: ' + customerError?.message);
            }
            customerId = newCustomer.id;
          }
        } else {
          // No customer name extracted - create placeholder customer
          const { data: placeholderCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              org_id: voiceQuote.org_id,
              name: 'Voice Quote Customer', // Placeholder name
              created_by_user_id: user.id
            })
            .select()
            .single();

          if (customerError || !placeholderCustomer) {
            throw new Error('Failed to create placeholder customer: ' + customerError?.message);
          }
          customerId = placeholderCustomer.id;
        }
      }

      // Generate quote number using the database function
      const { data: quoteNumberData, error: quoteNumberError } = await supabase
        .rpc('generate_quote_number', { p_org_id: voiceQuote.org_id });
      
      if (quoteNumberError || !quoteNumberData) {
        throw new Error('Failed to generate quote number: ' + quoteNumberError?.message);
      }

      // Create the quote
      const { data: newQuote, error: quoteError } = await supabase
        .from('quotes')
        .insert({
          org_id: voiceQuote.org_id,
          customer_id: customerId,
          quote_number: quoteNumberData,
          title: quoteData.jobTitle || 'Voice Quote',
          site_address: quoteData.jobLocation || null,
          source: 'voice',
          created_by_user_id: user.id
        })
        .select()
        .single();

      if (quoteError) {
        throw new Error('Failed to create quote: ' + quoteError.message);
      }

      console.log('[VoiceRecorder] Quote created:', newQuote.id);
      
      // Store the created quote ID for navigation
      setCreatedQuoteId(newQuote.id);

      // Create line items
      const lineItems = [];

      // Add materials line items
      if (quoteData.materials && Array.isArray(quoteData.materials)) {
        for (const material of quoteData.materials) {
          lineItems.push({
            org_id: voiceQuote.org_id,
            quote_id: newQuote.id,
            position: lineItems.length + 1,
            item_type: 'materials',
            description: material.name,
            quantity: material.quantity || 1,
            unit: material.unit || 'unit',
            unit_price_cents: 0, // Will need pricing profile
            line_total_cents: 0 // Will be calculated by triggers
          });
        }
      }

      // Add labor line item
      if (quoteData.laborHours) {
        lineItems.push({
          org_id: voiceQuote.org_id,
          quote_id: newQuote.id,
          position: lineItems.length + 1,
          item_type: 'labour',
          description: 'Labor',
          quantity: quoteData.laborHours,
          unit: 'hours',
          unit_price_cents: 0, // Will need pricing profile
          line_total_cents: 0 // Will be calculated by triggers
        });
      }

      if (lineItems.length > 0) {
        const { error: lineItemsError } = await supabase
          .from('quote_line_items')
          .insert(lineItems);

        if (lineItemsError) {
          console.error('[VoiceRecorder] Failed to create line items:', lineItemsError);
        } else {
          console.log('[VoiceRecorder] Created', lineItems.length, 'line items');
        }
      }

      // Update voice_quotes with quote_id and mark as complete
      await supabase
        .from('voice_quotes')
        .update({ 
          status: 'complete',
          // Store quote_id in quote_data for reference
          quote_data: {
            ...quoteData,
            created_quote_id: newQuote.id
          }
        })
        .eq('id', voiceQuoteId);

      console.log('[VoiceRecorder] Quote creation complete');

    } catch (error) {
      console.error('[VoiceRecorder] Quote creation failed:', error);
      await supabase
        .from('voice_quotes')
        .update({ status: 'failed' })
        .eq('id', voiceQuoteId);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // OLD POLLING SYSTEM - REMOVED (using useEffect polling now)
  /*
  const startPolling = (voiceQuoteId: string) => {
    console.log('[VoiceRecorder] Starting polling for voice quote:', voiceQuoteId);
    pollingStartTimeRef.current = Date.now();

    const pollVoiceQuote = async () => {
      try {
        const elapsed = Date.now() - (pollingStartTimeRef.current || 0);
        if (elapsed > 60000) {
          console.log('[VoiceRecorder] Polling timeout reached (60s)');
          stopPolling();
          return;
        }

        const { data, error } = await supabase
          .from('voice_quotes')
          .select('status, quote_data')
          .eq('id', voiceQuoteId)
          .maybeSingle();

        if (error) {
          console.error('[VoiceRecorder] Polling error:', error);
          return;
        }

        if (!data) {
          console.error('[VoiceRecorder] Voice quote not found');
          stopPolling();
          return;
        }

        console.log('[VoiceRecorder] Poll result - status:', data.status, 'has data:', !!data.quote_data);

        const quoteData = data.quote_data;
        if (quoteData) {
          updateChecklistFromData(quoteData);
        }

        if (data.status === 'extracted') {
          console.log('[VoiceRecorder] Extraction complete, waiting for all checklist items...');
        }
      } catch (error) {
        console.error('[VoiceRecorder] Polling exception:', error);
      }
    };

    pollVoiceQuote();
    pollingIntervalRef.current = window.setInterval(pollVoiceQuote, 2000);
  };
  */

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      console.log('[VoiceRecorder] Stopping polling');
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // OLD FUNCTION REMOVED - updateChecklistFromData was used by old polling system
  // The new useEffect polling (lines 63-120) handles checklist updates directly

  return (
    <div className="h-full w-full bg-[#FAFAFA] flex flex-col">
      <div className="flex items-center justify-between px-6 py-5 shrink-0">
        <h1 className="text-2xl font-bold text-[#0f172a]">Voice Quote</h1>
        <button
          onClick={onBack}
          disabled={isUploading}
          className="text-[15px] font-medium text-[#64748b] hover:text-[#0f172a] transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8">
        <div className="w-full max-w-md mx-auto">
          <div className="bg-white rounded-3xl p-6 shadow-sm w-full">
            <div className="text-center">
              <p className="text-[15px] text-[#64748b] mb-6">
                {isUploading ? 'Processing recording...' :
                 uploadSuccess ? 'Recording saved!' :
                 'Speak naturally. We\'ll build the quote.'}
              </p>

              {uploadSuccess ? (
                <div className="w-[100px] h-[100px] rounded-full mx-auto flex items-center justify-center bg-[#10b981] text-white mb-5">
                  <Check size={50} strokeWidth={3} />
                </div>
              ) : isUploading ? (
                <div className="w-[100px] h-[100px] rounded-full mx-auto flex items-center justify-center bg-[#f1f5f9] mb-5">
                  <div className="w-10 h-10 border-4 border-[#94a3b8] border-t-[#0f172a] rounded-full animate-spin"></div>
                </div>
              ) : (
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isUploading}
                  className="w-[100px] h-[100px] rounded-full mx-auto flex items-center justify-center transition-all duration-200 active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed mb-5"
                  style={{
                    background: isRecording ? '#ef4444' : '#84cc16',
                  }}
                >
                  {isRecording ? (
                    <Square size={40} fill="white" />
                  ) : (
                    <Mic size={40} strokeWidth={2} className="text-white" />
                  )}
                </button>
              )}

              {isRecording && (
                <div className="space-y-1.5 mb-5">
                  <div className="text-3xl font-bold text-[#0f172a] tabular-nums">
                    {formatTime(recordingTime)}
                  </div>
                  <div className="text-sm text-[#64748b]">
                    {60 - recordingTime}s remaining
                  </div>
                </div>
              )}

              {!isRecording && !isUploading && !uploadSuccess && (
                <div className="text-sm text-[#94a3b8] mb-5">
                  <p>Maximum: 60 seconds</p>
                </div>
              )}

              {/* Checklist - always visible to guide the user */}
              {!uploadSuccess && (
                <div className="mt-8 space-y-3">
                  <div className="text-sm font-medium text-[#64748b] mb-2">
                    {isRecording ? 'Mention these items as you speak:' : 'Please mention these items in your recording:'}
                  </div>
                  {checklistItems.map((item) => (
                    <div 
                      key={item.id}
                      className={`flex items-center gap-4 p-4 rounded-2xl transition-all duration-200 min-h-[56px] ${
                        item.status === 'detecting' ? 'bg-lime-50 animate-pulse' : 
                        item.status === 'complete' ? 'bg-lime-50' : 
                        'bg-gray-50'
                      }`}
                    >
                      <div className={`
                        w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0
                        ${item.status === 'waiting' && 'border-2 border-gray-300 text-gray-400 bg-white'}
                        ${item.status === 'detecting' && 'border-2 border-lime-400 text-lime-600 bg-white'}
                        ${item.status === 'complete' && 'bg-lime-400 text-lime-900'}
                      `}>
                        {item.status === 'complete' ? '✓' : item.id}
                      </div>
                      <div className="flex-1">
                        <div className={`font-medium text-[15px] ${
                          item.status === 'complete' ? 'text-lime-900' : 'text-slate-900'
                        }`}>
                          {item.label}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
