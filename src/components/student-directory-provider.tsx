"use client";

import { listActiveStudentsAction } from "@/actions/students";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type StudentOption = { id: string; name: string };

export type StudentDirectory =
  | { status: "idle"; students: StudentOption[] }
  | { status: "loading"; students: StudentOption[] }
  | { status: "success"; students: StudentOption[] }
  | { status: "error"; students: StudentOption[]; error: string };

type StudentDirectoryContextValue = {
  directory: StudentDirectory;
  ensureStudents: () => Promise<void>;
};

const StudentDirectoryContext =
  createContext<StudentDirectoryContextValue | null>(null);

export function StudentDirectoryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [directory, setDirectory] = useState<StudentDirectory>({
    status: "idle",
    students: [],
  });
  const directoryRef = useRef(directory);
  directoryRef.current = directory;
  const inFlight = useRef<Promise<void> | null>(null);

  const ensureStudents = useCallback(async () => {
    if (directoryRef.current.status === "success") {
      return;
    }
    if (inFlight.current) {
      await inFlight.current;
      return;
    }

    const request = (async () => {
      setDirectory({ status: "loading", students: [] });
      try {
        const result = await listActiveStudentsAction();
        if (result.ok) {
          setDirectory({ status: "success", students: result.data });
          return;
        }
        console.error("[ensureStudents]", { error: result.error });
        setDirectory({
          status: "error",
          students: [],
          error: result.error,
        });
      } catch (error) {
        console.error("[ensureStudents] unexpected", { error });
        setDirectory({
          status: "error",
          students: [],
          error: "無法載入學生",
        });
      } finally {
        inFlight.current = null;
      }
    })();

    inFlight.current = request;
    await request;
  }, []);

  return (
    <StudentDirectoryContext.Provider value={{ directory, ensureStudents }}>
      {children}
    </StudentDirectoryContext.Provider>
  );
}

export function useStudentDirectory() {
  const value = useContext(StudentDirectoryContext);
  if (!value) {
    throw new Error(
      "useStudentDirectory must be used within StudentDirectoryProvider",
    );
  }
  return value;
}

export function EnsureStudentDirectory() {
  const { ensureStudents } = useStudentDirectory();

  useEffect(() => {
    void ensureStudents();
  }, [ensureStudents]);

  return null;
}
