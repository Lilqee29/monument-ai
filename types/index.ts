export interface Monument {
  name: string;
  city: string;
  country: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  history: string;
  details: {
    built?: string;
    architect?: string;
    style?: string;
    height?: string;
    unesco?: boolean;
    fun_fact?: string;
    [key: string]: any;
  };
}

export interface Session {
  id: string;
  user_id: string;
  monument_name: string;
  location_city: string;
  location_country: string;
  coordinates: { lat: number, lng: number };
  photo_url: string;
  history_text: string;
  details: any;
  qa_thread: ChatMessage[];
  created_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
