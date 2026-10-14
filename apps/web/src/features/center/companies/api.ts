import {
  type Company,
  CompanyListSchema,
  CompanySchema,
  type CreateCompanyRequest,
  HrAccountListSchema,
  HrInvitationSchema,
  type InviteHrRequest,
  type UpdateCompanyRequest,
} from '@srm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api/client';

// Company and HR invitation hooks of the center portal (US-1.5 AC-1, AC-2, AC-10).

export const companyKeys = {
  all: ['companies'] as const,
  detail: (id: number) => ['companies', id] as const,
  hrAccounts: (id: number) => ['companies', id, 'hr-accounts'] as const,
};

export function useCompanies() {
  return useQuery({
    queryKey: companyKeys.all,
    queryFn: async () => CompanyListSchema.parse(unwrap(await api.GET('/api/companies'))).items,
  });
}

export function useCompany(id: number) {
  return useQuery({
    queryKey: companyKeys.detail(id),
    queryFn: async () =>
      CompanySchema.parse(unwrap(await api.GET('/api/companies/{id}', { params: { path: { id } } }))),
  });
}

function useStoreCompany() {
  const queryClient = useQueryClient();
  return (company: Company) => {
    queryClient.setQueryData(companyKeys.detail(company.id), company);
    void queryClient.invalidateQueries({ queryKey: companyKeys.all, exact: true });
  };
}

export function useCreateCompany() {
  const store = useStoreCompany();
  return useMutation({
    mutationFn: async (body: CreateCompanyRequest) =>
      CompanySchema.parse(unwrap(await api.POST('/api/companies', { body }))),
    onSuccess: store,
  });
}

export function useUpdateCompany(id: number) {
  const store = useStoreCompany();
  return useMutation({
    mutationFn: async (body: UpdateCompanyRequest) =>
      CompanySchema.parse(unwrap(await api.PATCH('/api/companies/{id}', { params: { path: { id } }, body }))),
    onSuccess: store,
  });
}

export function useHrAccounts(companyId: number) {
  return useQuery({
    queryKey: companyKeys.hrAccounts(companyId),
    queryFn: async () =>
      HrAccountListSchema.parse(
        unwrap(await api.GET('/api/companies/{id}/hr-accounts', { params: { path: { id: companyId } } })),
      ).items,
  });
}

/** Invites (or re-invites) an HR account; the answer carries the link to send by hand. */
export function useInviteHr(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: InviteHrRequest) =>
      HrInvitationSchema.parse(
        unwrap(await api.POST('/api/companies/{id}/hr-invitations', { params: { path: { id: companyId } }, body })),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: companyKeys.hrAccounts(companyId) }),
  });
}
