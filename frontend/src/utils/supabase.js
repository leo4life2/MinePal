import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wwcgmpbfypiagjfeixmn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3Y2dtcGJmeXBpYWdqZmVpeG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMwNTMwNjAsImV4cCI6MjA0ODYyOTA2MH0.7L7IeDKmuSmI7qKLXgylmwihpM6sLsljv32FsK-sbf4';

export const supabase = createClient(supabaseUrl, supabaseKey);

export const insertFeedback = async (feedbackData) => {
  const { error } = await supabase
    .from('Feedback')
    .insert([{ feedback: feedbackData }]);

  if (error) {
    throw error;
  }
}; 