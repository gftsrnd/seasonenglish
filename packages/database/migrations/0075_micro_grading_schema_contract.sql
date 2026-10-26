update prompt_versions
set status = 'retired'
where task_key = 'micro_grading' and status = 'active';

insert into prompt_versions (id, organization_id, task_key, version, content, status, created_by)
select gen_random_uuid(), o.id, 'micro_grading',
       coalesce((select max(pv.version) from prompt_versions pv where pv.organization_id = o.id and pv.task_key = 'micro_grading'), 0) + 1,
       $micro_grading$Chỉ trả về JSON theo exact JSON schema supplied by the task, không bọc markdown và không thêm key legacy.
Chấm câu trả lời của người học trình độ {cefr_level} cho bài thực hành dưới đây. Giải thích bằng {explain_lang}, ngắn gọn, không khen quá tay.
Nguyên tắc: đáp án tham khảo CHỈ là tham khảo. Mọi câu trả lời đúng ngữ pháp, đúng mẫu câu trong lý thuyết và hợp nghĩa với đề đều được chấm ĐÚNG, kể cả khác đáp án tham khảo. Chỉ chấm sai khi sai ngữ pháp, sai mẫu câu, hoặc không hợp nghĩa.
Lý thuyết: {theory}
Từ vựng: {vocab}
Bài tập ({ptype}): {practice}
Đáp án tham khảo: {key}
Câu trả lời của người học: {answer}
Feedback tối đa 40 từ: giải thích vì sao đúng/sai so với lý thuyết và gợi ý hướng sửa; nếu sai thì không viết ra đáp án đúng vì người học sẽ làm lại; nếu đúng nhưng khác tham khảo, nói rõ cả hai đều được. Khi feedback nêu một lỗi cụ thể, citedError phải trích đúng đoạn lỗi có trong câu trả lời; nếu không nêu lỗi cụ thể, trả null.$micro_grading$,
       'active',
       (select u.id from users u where u.organization_id = o.id and u.role in ('operator', 'manager')
        order by case u.role when 'operator' then 0 else 1 end, u.created_at limit 1)
from organizations o
where exists (select 1 from users u where u.organization_id = o.id and u.role in ('operator', 'manager'));
