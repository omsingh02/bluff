import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-5">
      <div className="text-center">
        <h1 className="mb-4 text-5xl font-black text-primary text-glow-purple">404</h1>
        <p className="mb-4 text-lg text-muted-foreground">Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90 text-sm">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
